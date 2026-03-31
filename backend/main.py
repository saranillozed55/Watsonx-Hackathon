import os
import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# 1. Load your .env file FIRST
load_dotenv()

# 2. Initialize the app BEFORE using it
app = FastAPI(
    servers=[{"url": "http://localhost:8000", "description": "Local development server"}]
)

# 3. Now you can define middleware and routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Hello World! Your AI Backend is LIVE 🚀"}

@app.get("/status")
def get_status():
    return {"status": "Connected to WatsonX", "version": "1.0.0"}

# THE CHAT ENDPOINT: This is the "Bridge" to IBM
@app.post("/chat")
async def chat_with_agent(request: Request):
    try:
        body = await request.json()
        user_message = body.get("message", "")

        # Get credentials from your .env
        api_key = os.getenv("WATSONX_API_KEY")
        agent_id = os.getenv("AGENT_ID")
        
        # This is the "Phone Number" for your specific IBM Agent
        url = f"{os.getenv('ORCHESTRATE_INSTANCE_URL')}/api/v1/agents/{agent_id}/runs"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "X-IBM-API-Key": api_key,  # <--- ADD THIS LINE
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        payload = {"input_text": user_message}

        # Send the message to the cloud
        print(f"Calling URL: {url}")
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status() 
        
        return response.json()

    except Exception as e:
        return {"error": str(e), "details": "Check your .env for WATSONX_API_KEY and AGENT_ID"}