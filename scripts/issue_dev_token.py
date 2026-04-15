import sys
import os

# Add project root to sys.path if needed to import from scripts
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from generate_token import generate_token
except ImportError:
    # Handle direct execution from root or scripts dir
    from scripts.generate_token import generate_token

def issue_token():
    """
    Standard entry point for issuing dev tokens.
    Returns 0 on success, non-zero on error.
    """
    try:
        # Generate token using standard dev team ID
        token = generate_token()
        if not token:
            print("Error: Generated token is empty", file=sys.stderr)
            sys.exit(1)
        # ONLY stdout should contain the token
        print(token)
    except Exception as e:
        print(f"Critical Error issuing dev token: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    issue_token()
