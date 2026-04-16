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
CHAT_URL = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/{AGENT_ID}/chat/completions"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Token cache ---
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

# --- Thread store (per user session) ---
thread_store = {}  # { session_id: thread_id }

# --- Request/Response models ---
class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    session_id: str
    reply: str
    thread_id: str

# --- Routes ---
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
        "stream": False,
        "messages": [{"role": "user", "content": req.message}]
    }
    if thread_id:
        body["thread_id"] = thread_id

    response = requests.post(
        CHAT_URL,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body
    )

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    data = response.json()
    new_thread_id = data.get("thread_id")
    thread_store[req.session_id] = new_thread_id
    reply = data["choices"][0]["message"]["content"]

    return ChatResponse(session_id=req.session_id, reply=reply, thread_id=new_thread_id)