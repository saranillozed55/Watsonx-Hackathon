import requests
import os
import time
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("WATSONX_API_KEY")
AGENT_ID = os.getenv("AGENT_ID")
ORCHESTRATE_INSTANCE_URL = os.getenv("ORCHESTRATE_INSTANCE_URL").rstrip("/")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

token_cache = {"token": None, "expires_at": 0}

def get_iam_token():
    if time.time() < token_cache["expires_at"] - 60:
        return token_cache["token"]
    r = requests.post(
        "https://iam.cloud.ibm.com/identity/token",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": API_KEY}
    )
    data = r.json()
    token_cache["token"] = data["access_token"]
    token_cache["expires_at"] = time.time() + data["expires_in"]
    return token_cache["token"]

thread_store = {}

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    session_id: str
    reply: str
    thread_id: str

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/new-session")
def new_session():
    session_id = str(uuid.uuid4())
    return {"session_id": session_id}

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    token = get_iam_token()
    thread_id = thread_store.get(req.session_id)

    body = {
        "message": {"role": "user", "content": req.message},
        "agent_id": AGENT_ID
    }
    if thread_id:
        body["thread_id"] = thread_id

    url = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/runs?stream=false"

    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        json=body
    )

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    data = response.json()
    new_thread_id = data.get("thread_id")
    run_id = data.get("run_id")
    thread_store[req.session_id] = new_thread_id

    poll_url = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/runs/{run_id}"
    for _ in range(30):
        time.sleep(2)
        poll_response = requests.get(
            poll_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json"
            }
        )
        poll_data = poll_response.json()
        status = poll_data.get("status")
        if status == "completed":
            try:
                content_list = poll_data["result"]["data"]["message"]["content"]
                reply = content_list[0].get("text", "No response")
            except (KeyError, IndexError, TypeError):
                reply = "No response"
            return ChatResponse(
                session_id=req.session_id,
                reply=reply,
                thread_id=new_thread_id
            )
        elif status == "failed":
            raise HTTPException(status_code=500, detail="Agent run failed")

    raise HTTPException(status_code=504, detail="Agent timed out")