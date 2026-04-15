
import os
import asyncio
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

async def test_openrouter():
    api_key = os.getenv("MODEL_API_KEY")
    base_url = os.getenv("MODEL_BASE_URL", "https://openrouter.ai/api/v1")
    model = "openai/gpt-4o-mini"
    
    print(f"Testing OpenRouter connectivity...")
    print(f"Base URL: {base_url}")
    print(f"Model: {model}")
    
    if not api_key or api_key == "test_key":
        print("ERROR: MODEL_API_KEY is not set or is 'test_key'. Please set a real OpenRouter API key in .env")
        return

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Say 'connectivity success' if you can read this."}]
        )
        print("\n--- Response ---")
        print(resp.choices[0].message.content)
        print("--- Usage ---")
        print(resp.usage)
        print("\nSUCCESS: OpenRouter is reachable and responding.")
    except Exception as e:
        print(f"\nFAILED: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_openrouter())
