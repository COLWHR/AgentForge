
import requests
import json
import time
import sys
import os

# Configuration
BASE_URL = "http://localhost:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidXNlcl9hZG1pbiIsInRlYW1faWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjE3NzYyNDA4ODN9.lLB2jTzjQek9RxYerKCy77PQmhb_3D_EK1xzlOA7iFQ"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

def create_agent():
    print("\n1. Creating Agent...")
    payload = {
        "system_prompt": "You are a helpful assistant. Always respond in JSON with 'thought' and 'action' fields. Use action type 'finish' when you have the final answer.",
        "model_config": {
            "model": "openai/gpt-4o-mini",
            "temperature": 0.7,
            "max_tokens": 1000
        },
        "tools": [],
        "constraints": {
            "max_steps": 5
        }
    }
    resp = requests.post(f"{BASE_URL}/agents", headers=HEADERS, json=payload)
    if resp.status_code != 200:
        print(f"FAILED: {resp.status_code} - {resp.text}")
        sys.exit(1)
    
    agent_id = resp.json()["data"]["id"]
    print(f"SUCCESS: Agent Created (ID: {agent_id})")
    return agent_id

def execute_agent(agent_id):
    print(f"\n2. Executing Agent {agent_id}...")
    payload = {
        "input": "Who are you? Answer in 1 sentence."
    }
    resp = requests.post(f"{BASE_URL}/agents/{agent_id}/execute", headers=HEADERS, json=payload)
    if resp.status_code != 200:
        print(f"FAILED: {resp.status_code} - {resp.text}")
        sys.exit(1)
    
    execution_id = resp.json()["data"]["execution_id"]
    print(f"SUCCESS: Execution Started (ID: {execution_id})")
    return execution_id

def get_execution(execution_id):
    print(f"\n3. Polling Execution {execution_id}...")
    
    # Poll for 30 seconds
    for i in range(10):
        resp = requests.get(f"{BASE_URL}/executions/{execution_id}", headers=HEADERS)
        if resp.status_code != 200:
            print(f"FAILED: {resp.status_code} - {resp.text}")
            sys.exit(1)
        
        data = resp.json()["data"]
        status = data["status"]
        print(f"Attempt {i+1}: Status = {status}")
        
        if status in ["success", "failed"]:
            print("\n--- FINAL DATA ---")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            
            if status == "success":
                print(f"\nSUCCESS: Execution completed with final answer: {data['final_answer']}")
                return True
            else:
                print(f"\nFAILED: Execution failed with error: {data.get('error_message', 'Unknown error')}")
                return False
        
        time.sleep(3)
    
    print("\nFAILED: Execution timed out.")
    return False

if __name__ == "__main__":
    agent_id = create_agent()
    execution_id = execute_agent(agent_id)
    success = get_execution(execution_id)
    
    if success:
        print("\n=== PHASE C0 VERIFICATION PASSED ===")
        sys.exit(0)
    else:
        print("\n=== PHASE C0 VERIFICATION FAILED ===")
        sys.exit(1)
