import os
import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NEW: This function trades your API Key for a temporary token
def get_iam_token(api_key):
    url = "https://iam.cloud.ibm.com/identity/token"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
        "apikey": api_key
    }
    response = requests.post(url, headers=headers, data=data)
    response.raise_for_status()
    return response.json().get("access_token")

@app.post("/chat")
async def chat_with_agent(request: Request):
    try:
        body = await request.json()
        user_message = body.get("message", "")

        api_key = os.getenv("WATSONX_API_KEY")
        agent_id = os.getenv("AGENT_ID")
        base_url = os.getenv("ORCHESTRATE_INSTANCE_URL")

        # 1. Get the temporary token
        iam_token = get_iam_token(api_key)
        
        # 2. Call the Agent using the TOKEN, not the key
        url = f"{base_url}/api/v1/agents/{agent_id}/runs"
        
        headers = {
            "Authorization": f"Bearer {iam_token}", # Use the token here!
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        payload = {
        "input": user_message  # Just 'input', no 'input_text' or 'context'
}
        
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status() 
        
        return response.json()

    except Exception as e:
        # Add this print line to see the REAL error in your uvicorn terminal
        if hasattr(e, 'response') and e.response is not None:
            print(f"IBM Error Detail: {e.response.text}")
        
        return {"error": str(e), "details": "Check the terminal for IBM Error Detail"}