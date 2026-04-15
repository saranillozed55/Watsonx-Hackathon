import requests
import os
import time
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
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
thread_store = {}


def get_iam_token():
    if time.time() < token_cache["expires_at"] - 60:
        return token_cache["token"]
    try:
        r = requests.post(
            "https://iam.cloud.ibm.com/identity/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": API_KEY
            },
            timeout=30
        )
    except requests.exceptions.ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach IBM IAM — check network/VPN: {str(e)}")

    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=f"IAM token error: {r.text}")

    data = r.json()
    token_cache["token"] = data["access_token"]
    token_cache["expires_at"] = time.time() + data["expires_in"]
    return token_cache["token"]


# ── Models ────────────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    risk:      Optional[str] = None
    goal:      Optional[str] = None
    horizon:   Optional[str] = None
    portfolio: Optional[str] = None


class Holding(BaseModel):
    ticker: str
    value:  float


class ChatRequest(BaseModel):
    session_id: str
    message:    str
    profile:    Optional[UserProfile] = None
    holdings:   Optional[List[Holding]] = None


class ChatResponse(BaseModel):
    session_id: str
    reply:      str
    thread_id:  str


# ── Context builder ───────────────────────────────────────────────────────────

def build_message(req: ChatRequest) -> str:
    lines = []

    # 1. User profile
    if req.profile and any([req.profile.risk, req.profile.goal, req.profile.horizon]):
        parts = []
        if req.profile.risk:      parts.append(f"risk tolerance: {req.profile.risk}")
        if req.profile.goal:      parts.append(f"investment goal: {req.profile.goal}")
        if req.profile.horizon:   parts.append(f"time horizon: {req.profile.horizon}")
        if req.profile.portfolio: parts.append(f"stated portfolio size: {req.profile.portfolio}")
        lines.append("User profile — " + ", ".join(parts) + ".")

    # 2. Portfolio holdings
    if req.holdings:
        total = sum(h.value for h in req.holdings)
        holding_strs = []
        for h in req.holdings:
            pct = round(h.value / total * 100) if total else 0
            holding_strs.append(f"{h.ticker} (${h.value:,.0f}, {pct}%)")
        lines.append(
            f"Current portfolio (total ${total:,.0f}): " +
            ", ".join(holding_strs) + "."
        )

    if lines:
        return "\n".join(lines) + "\n\n" + req.message
    return req.message


# ── Routes ────────────────────────────────────────────────────────────────────

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
        "message": {"role": "user", "content": build_message(req)},
        "agent_id": AGENT_ID
    }

    if thread_id:
        body["thread_id"] = thread_id

    url = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/runs?stream=false"

    print(f"URL: {url}")
    print(f"AGENT_ID: {AGENT_ID}")
    print(f"Body: {body}")

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            json=body,
            timeout=60
        )
    except requests.exceptions.RequestException as e:
        print(f"Connection error: {e}")
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    data = response.json()
    new_thread_id = data.get("thread_id")
    run_id = data.get("run_id")

    if not run_id:
        raise HTTPException(status_code=500, detail=f"No run_id returned: {data}")

    thread_store[req.session_id] = new_thread_id

    poll_url = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/runs/{run_id}"

    for i in range(60):
        time.sleep(2)

        try:
            poll_response = requests.get(
                poll_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json"
                },
                timeout=30
            )
        except requests.exceptions.RequestException as e:
            raise HTTPException(status_code=500, detail=f"Polling error: {str(e)}")

        if poll_response.status_code != 200:
            raise HTTPException(status_code=poll_response.status_code, detail=poll_response.text)

        poll_data = poll_response.json()
        status = poll_data.get("status")
        print(f"Poll {i+1}: status = {status}")

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
            print("Run failed:", poll_data)
            raise HTTPException(status_code=500, detail="Agent run failed")

    raise HTTPException(status_code=504, detail="Agent timed out")