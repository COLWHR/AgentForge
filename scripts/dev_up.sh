#!/usr/bin/env bash

set -u
set -o pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$PROJECT_ROOT/.tmp/dev_up"
BACKEND_PID_FILE="$TMP_DIR/backend.pid"
FRONTEND_PID_FILE="$TMP_DIR/frontend.pid"
REDIS_PID_FILE="$TMP_DIR/redis.pid"
BACKEND_PIPE="$TMP_DIR/backend.pipe"
FRONTEND_PIPE="$TMP_DIR/frontend.pipe"

BACKEND_PID=""
FRONTEND_PID=""
BACKEND_LOG_PID=""
FRONTEND_LOG_PID=""
_CLEANED_UP=0

log() {
  echo "[dev_up] $*"
}

kill_pid() {
  local pid="$1"
  local label="$2"
  if [ -z "$pid" ]; then
    return 0
  fi
  if kill -0 "$pid" 2>/dev/null; then
    log "stopping $label pid=$pid"
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

cleanup_pid_file() {
  local file="$1"
  local label="$2"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
      kill_pid "$pid" "$label"
    fi
    rm -f "$file"
  fi
}

kill_port_processes() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    log "cleaning occupied port $port"
    for pid in $pids; do
      kill_pid "$pid" "port-$port"
    done
  fi
}

kill_by_pattern() {
  local pattern="$1"
  local label="$2"
  local pids
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    for pid in $pids; do
      if [ "$pid" != "$$" ]; then
        kill_pid "$pid" "$label"
      fi
    done
  fi
}

cleanup_all() {
  if [ "$_CLEANED_UP" -eq 1 ]; then
    return 0
  fi
  _CLEANED_UP=1

  set +e
  kill_pid "$FRONTEND_PID" "frontend"
  kill_pid "$BACKEND_PID" "backend"
  kill_pid "$FRONTEND_LOG_PID" "frontend-log"
  kill_pid "$BACKEND_LOG_PID" "backend-log"
  cleanup_pid_file "$FRONTEND_PID_FILE" "frontend-pidfile"
  cleanup_pid_file "$BACKEND_PID_FILE" "backend-pidfile"
  rm -f "$BACKEND_PIPE" "$FRONTEND_PIPE"
}

trap cleanup_all EXIT INT TERM

mkdir -p "$TMP_DIR"

log "startup cleanup begin"
cleanup_pid_file "$PROJECT_ROOT/.tmp/single_agent_it/backend.pid" "legacy-backend-pidfile"
cleanup_pid_file "$PROJECT_ROOT/.tmp/single_agent_it/frontend.pid" "legacy-frontend-pidfile"
cleanup_pid_file "$PROJECT_ROOT/.tmp/single_agent_it/redis.pid" "legacy-redis-pidfile"
cleanup_pid_file "$BACKEND_PID_FILE" "backend-pidfile"
cleanup_pid_file "$FRONTEND_PID_FILE" "frontend-pidfile"
cleanup_pid_file "$REDIS_PID_FILE" "redis-pidfile"

kill_port_processes 8000
kill_port_processes 5173
kill_port_processes 5174
kill_by_pattern "uvicorn backend.main:app" "legacy-uvicorn"
kill_by_pattern "$PROJECT_ROOT/frontend.*vite" "legacy-vite"
kill_by_pattern "$PROJECT_ROOT/frontend.*npm run dev" "legacy-npm-dev"

if redis-cli ping >/dev/null 2>&1; then
  :
else
  kill_by_pattern "redis-server.*6379" "legacy-redis"
fi
log "startup cleanup done"

if [ ! -f "$PROJECT_ROOT/.venv/bin/activate" ]; then
  echo "[dev_up] missing .venv, run: bash scripts/reset_env.sh"
  exit 1
fi

cd "$PROJECT_ROOT"
# shellcheck disable=SC1091
source .venv/bin/activate
python -V

python - <<'PY'
import sys
assert sys.version_info >= (3, 10), "Python version must be >= 3.10"
print("Python version OK")
PY

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if redis-cli ping >/dev/null 2>&1; then
  log "redis already running"
else
  log "starting redis-server"
  redis-server --daemonize yes
  sleep 1
fi

if ! redis-cli ping >/dev/null 2>&1; then
  echo "[dev_up] redis start failed"
  exit 1
fi

if pgrep -f "redis-server.*6379" >/dev/null 2>&1; then
  pgrep -f "redis-server.*6379" | head -n 1 > "$REDIS_PID_FILE"
fi

rm -f "$BACKEND_PIPE" "$FRONTEND_PIPE"
mkfifo "$BACKEND_PIPE"
mkfifo "$FRONTEND_PIPE"

sed -u 's/^/[backend] /' < "$BACKEND_PIPE" &
BACKEND_LOG_PID="$!"

sed -u 's/^/[frontend] /' < "$FRONTEND_PIPE" &
FRONTEND_LOG_PID="$!"

export PYTHONPATH="$PROJECT_ROOT"
if [ -f "$PROJECT_ROOT/.env.test" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env.test"
  set +a
fi
export ENV="dev"
export DB_URL="sqlite+aiosqlite:///$PROJECT_ROOT/agentforge_preview.db"
export REDIS_URL="redis://localhost:6379/1"
export OPENROUTER_BASE_URL="${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}"
export OPENROUTER_MODEL="${OPENROUTER_MODEL:-openai/gpt-4o-mini}"

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  OPENROUTER_API_KEY="${MODEL_API_KEY:-}"
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "[dev_up] missing OPENROUTER_API_KEY (or MODEL_API_KEY). Refusing to start model-dependent dev backend."
  exit 1
fi

export OPENROUTER_API_KEY
export MODEL_API_KEY="${MODEL_API_KEY:-$OPENROUTER_API_KEY}"
export MODEL_BASE_URL="${MODEL_BASE_URL:-$OPENROUTER_BASE_URL}"

log "starting backend"
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload > "$BACKEND_PIPE" 2>&1 &
BACKEND_PID="$!"
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

backend_ready=0
i=0
while [ "$i" -lt 30 ]; do
  if lsof -ti tcp:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    backend_ready=1
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    break
  fi
  sleep 1
  i=$((i + 1))
done

if [ "$backend_ready" -ne 1 ]; then
  echo "[dev_up] backend failed to start on port 8000"
  exit 1
fi

log "starting frontend"
(
  cd "$PROJECT_ROOT/frontend" || exit 1
  if [ ! -d "node_modules" ]; then
    echo "node_modules missing, running npm install"
    npm install || exit 1
  fi
  npm run dev
) > "$FRONTEND_PIPE" 2>&1 &
FRONTEND_PID="$!"
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

log "services up: backend=8000 frontend=5173/5174 (vite fallback port possible)"
log "press Ctrl+C to stop"

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[dev_up] backend process exited"
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "[dev_up] frontend process exited"
    exit 1
  fi
  sleep 1
done
