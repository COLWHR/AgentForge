# AgentForge Local Development

## Local Development Rules (Current Phase)

- Current phase forbids Docker, `docker-compose`, and any containerized startup path.
- Current phase requires all services to run as local machine processes.
- `.venv` is the only allowed Python runtime environment.
- Do not run backend/frontend directly with system commands.

## Standard Commands

- Reset environment:

```bash
bash scripts/reset_env.sh
```

- Start local development stack:

```bash
bash scripts/dev_up.sh
```

## Forbidden Commands

- `uvicorn backend.main:app`
- `python3 backend/main.py`
- `npm run dev`
- `docker compose up`
- `docker run ...`
