import os
import uuid
import requests
from fastapi import FastAPI, Request, HTTPException
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

# ─── IAM Token (cached per process run) ───────────────────────────────────────
_cached_token = None

def get_iam_token(api_key: str) -> str:
    """Exchange your IBM API key for a short-lived Bearer token."""
    global _cached_token
    # In production, add expiry checking. For a hackathon, re-fetch per restart.
    url = "https://iam.cloud.ibm.com/identity/token"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
        "apikey": api_key,
    }
    resp = requests.post(url, headers=headers, data=data)
    resp.raise_for_status()
    _cached_token = resp.json()["access_token"]
    return _cached_token

# ─── In-memory session store ───────────────────────────────────────────────────
# Maps session_id → thread_id (IBM Orchestrate conversation thread)
# In production use Redis or a DB. For hackathon, in-memory is fine.
sessions: dict[str, str] = {}


def call_orchestrate(user_message: str, thread_id: str | None) -> dict:
    api_key  = os.getenv("WATSONX_API_KEY")
    agent_id = os.getenv("AGENT_ID")
    base_url = os.getenv("ORCHESTRATE_INSTANCE_URL")  
    # e.g. https://api.jp-tok.watson-orchestrate.cloud.ibm.com/instances/b497a737-...

    token = get_iam_token(api_key)

    # ✅ CORRECT endpoint
    url = f"{base_url}/v1/orchestrate/runs?stream=false"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    # ✅ CORRECT payload shape
    payload = {
        "message": {
            "role": "user",
            "content": user_message
        },
        "agent_id": agent_id,
    }

    # Include thread_id for multi-turn conversation
    if thread_id:
        payload["thread_id"] = thread_id

    resp = requests.post(url, json=payload, headers=headers, timeout=60)
    if not resp.ok:
        print(f"[IBM ERROR] {resp.status_code}: {resp.text}")
        resp.raise_for_status()

    return resp.json()


def extract_reply(ibm_response: dict) -> tuple[str, str | None]:
    """
    Pull the text reply and thread_id out of IBM's response.
    
    IBM Orchestrate responses look like:
    {
      "thread_id": "abc-123",
      "output": {
        "text": "Here is your portfolio analysis..."
      }
    }
    OR (for streaming/async):
    {
      "run_id": "...",
      "status": "completed",
      "output": { "text": "..." }
    }
    
    Adjust the field names below if your instance returns different keys.
    Run `print(ibm_response)` in the terminal to see the real shape.
    """
    thread_id = ibm_response.get("thread_id") or ibm_response.get("run_id")
    
    # Try common response shapes
    output = ibm_response.get("output", {})
    
    if isinstance(output, dict):
        reply_text = (
            output.get("text")
            or output.get("response")
            or output.get("message")
            or str(output)
        )
    elif isinstance(output, str):
        reply_text = output
    else:
        # Fallback: dump the whole response so you can debug
        reply_text = f"[DEBUG] Unexpected response shape: {ibm_response}"

    return reply_text, thread_id


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(request: Request):
    """
    Accepts:  { "message": "...", "session_id": "optional-uuid" }
    Returns:  { "reply": "...", "session_id": "...", "raw": {...} }
    """
    try:
        body = await request.json()
        user_message: str = body.get("message", "").strip()
        session_id: str   = body.get("session_id") or str(uuid.uuid4())

        if not user_message:
            raise HTTPException(status_code=400, detail="'message' field is required")

        # Look up existing IBM thread for this session
        thread_id = sessions.get(session_id)

        # Call IBM Orchestrate (hits your orchestrator_agent)
        ibm_resp = call_orchestrate(user_message, thread_id)
        print(f"[IBM RAW RESPONSE] {ibm_resp}")   # ← keep this during hackathon dev

        reply_text, new_thread_id = extract_reply(ibm_resp)

        # Persist the thread_id so follow-up messages stay in context
        if new_thread_id:
            sessions[session_id] = new_thread_id

        return {
            "reply": reply_text,
            "session_id": session_id,
            "thread_id": new_thread_id,
            "raw": ibm_resp,   # remove this before demo if you want to hide internals
        }

    except requests.HTTPError as e:
        detail = ""
        if e.response is not None:
            detail = e.response.text
        print(f"[HTTP ERROR] {e} — {detail}")
        raise HTTPException(status_code=502, detail=f"IBM Orchestrate error: {detail}")

    except Exception as e:
        print(f"[UNHANDLED ERROR] {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Run locally ──────────────────────────────────────────────────────────────
# uvicorn main:app --reload --port 8000