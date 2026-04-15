#!/bin/bash
set -e

echo "==========================================="
echo "  AgentForge v0.1 Acceptance Test Script   "
echo "==========================================="

export PYTHONPATH=.

echo ""
echo "[1/3] Running Unit Tests..."
pytest tests/unit/ -v --tb=short
echo "✓ Unit Tests Passed"

echo ""
echo "[2/3] Running Integration Tests..."
# These tests require Test DB and Test Redis to be up.
# Test environment failure is not a system defect, but for CI we assume it's running.
pytest tests/integration/ -v --tb=short || {
    echo "⚠️  Integration tests failed or skipped. Ensure Test DB and Redis are running."
    # We allow the script to fail here since the plan requires tests to pass for V0.1 delivery.
    exit 1
}
echo "✓ Integration Tests Passed"

echo ""
echo "[3/3] Running E2E Tests..."
pytest tests/e2e/ -v --tb=short || {
    echo "⚠️  E2E tests failed. Ensure Test DB, Redis, and valid LLM API key are configured."
    exit 1
}
echo "✓ E2E Tests Passed"

echo ""
echo "==========================================="
echo "  🎉 ACCEPTANCE SUCCESSFUL: v0.1 PASSED    "
echo "==========================================="
echo "The system satisfies the 6 criteria of AGENTFORGE_V0_1_DELIVERY_CHECKLIST.md:"
echo "  1. ExecutionEngine 可运行"
echo "  2. PythonSandbox 可执行"
echo "  3. ModelGateway 可调用"
echo "  4. 日志完整记录"
echo "  5. API 全部可用"
echo "  6. 配额控制生效"
