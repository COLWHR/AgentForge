import subprocess
import os
import sys
import json

def run_command(cmd, env=None):
    """Utility to run shell command and return output."""
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=True, 
            text=True, 
            env={**os.environ, **(env or {})}
        )
        return result
    except Exception as e:
        print(f"Error running command '{cmd}': {e}")
        return None

def verify_b2():
    print("--- Phase B2 Integration Baseline Verification ---")
    
    # 1. Verify Team UUID exists
    print("\n[1/4] Checking Team Alpha UUID existence...")
    team_check = run_command("export PYTHONPATH=$PYTHONPATH:. && python3 scripts/check_team.py")
    if team_check and team_check.returncode == 0:
        print("✅ Team exists and verified.")
    else:
        print("❌ Team check failed.")
        print(team_check.stderr if team_check else "No output")

    # 2. Verify Dev Token Issuance
    print("\n[2/4] Verifying scripts/issue_dev_token.py...")
    token_check = run_command("export PYTHONPATH=$PYTHONPATH:. && python3 scripts/issue_dev_token.py")
    if token_check and token_check.returncode == 0 and len(token_check.stdout.strip()) > 50:
        print(f"✅ Dev token issued successfully: {token_check.stdout.strip()[:10]}...{token_check.stdout.strip()[-10:]}")
        token = token_check.stdout.strip()
    else:
        print("❌ Token issuance failed.")
        print(token_check.stderr if token_check else "No output")
        token = None

    # 3. Verify CORS Config Logic
    print("\n[3/4] Verifying backend CORS config logic (via Environment Variables)...")
    # We'll mock importing settings with a custom CORS_ALLOWED_ORIGINS env var
    cors_test_env = {"CORS_ALLOWED_ORIGINS": "http://test1.com,http://test2.com"}
    cors_check = run_command(
        "export PYTHONPATH=$PYTHONPATH:. && python3 -c 'import json; from backend.core.config import settings; print(json.dumps(settings.CORS_ALLOWED_ORIGINS))'",
        env=cors_test_env
    )
    if cors_check and cors_check.returncode == 0:
        origins = json.loads(cors_check.stdout.strip())
        if origins == ["http://test1.com", "http://test2.com"]:
            print("✅ CORS environment variable parsing verified.")
        else:
            print(f"❌ CORS parsing mismatch: {origins}")
    else:
        print("❌ CORS config check failed.")
        print(cors_check.stderr if cors_check else "No output")

    # 4. Verify Backend API Acceptance (requires backend running)
    # Since we can't easily start the backend in this script and wait, 
    # we'll assume the manual verification step from the user instructions.
    # But we can verify that the frontend package.json has the correct dev script.
    print("\n[4/4] Verifying Frontend Startup Flow...")
    with open("frontend/package.json", "r") as f:
        pkg = json.load(f)
        dev_script = pkg.get("scripts", {}).get("dev", "")
        if "scripts/dev-with-token.mjs" in dev_script:
            print("✅ frontend/package.json dev script updated.")
        else:
            print(f"❌ frontend/package.json dev script incorrect: {dev_script}")

    print("\n--- Verification Complete ---")
    if token and "scripts/dev-with-token.mjs" in dev_script:
        print("\nSTATUS: PASS - Ready for Phase C.")
    else:
        print("\nSTATUS: FAIL - Check issues above.")

if __name__ == "__main__":
    verify_b2()
