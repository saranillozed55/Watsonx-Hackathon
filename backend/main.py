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

API_KEY                  = os.getenv("WATSONX_API_KEY")
AGENT_ID                 = os.getenv("AGENT_ID")
ORCHESTRATE_INSTANCE_URL = os.getenv("ORCHESTRATE_INSTANCE_URL").rstrip("/")
MASSIVE_API_KEY          = os.getenv("MASSIVE_API_KEY")

print(f"MASSIVE_API_KEY loaded: {'YES' if MASSIVE_API_KEY else 'NO — check .env'}")

MASSIVE_BASE = "https://api.massive.com"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

token_cache  = {"token": None, "expires_at": 0}
thread_store = {}
market_cache = {"data": None, "fetched_at": 0}


# ── IBM IAM token ─────────────────────────────────────────────────────────────

def get_iam_token():
    if time.time() < token_cache["expires_at"] - 60:
        return token_cache["token"]
    try:
        r = requests.post(
            "https://iam.cloud.ibm.com/identity/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": API_KEY},
            timeout=30
        )
    except requests.exceptions.ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach IBM IAM: {str(e)}")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=f"IAM token error: {r.text}")
    data = r.json()
    token_cache["token"]      = data["access_token"]
    token_cache["expires_at"] = time.time() + data["expires_in"]
    return token_cache["token"]


# ── Massive API helpers ───────────────────────────────────────────────────────

def massive_get(path: str, params: dict = None):
    if not MASSIVE_API_KEY:
        raise HTTPException(status_code=500, detail="MASSIVE_API_KEY not set in .env")
    p = dict(params or {})
    p["apiKey"] = MASSIVE_API_KEY
    r = requests.get(f"{MASSIVE_BASE}{path}", params=p, timeout=15)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=f"Massive API error ({path}): {r.text}")
    return r.json()


def _pct(close, prev_c):
    if not prev_c:
        return 0.0
    return round((close - prev_c) / prev_c * 100, 2)


def fetch_stock(ticker: str):
    """
    Free-tier safe.
    GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
    """
    try:
        data   = massive_get(f"/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}")
        t      = data.get("ticker", {})
        day    = t.get("day", {})
        prev   = t.get("prevDay", {})
        close  = day.get("c") or prev.get("c") or 0
        prev_c = prev.get("c") or close
        chg    = _pct(close, prev_c)
        print(f"  {ticker}: close={close}, prev={prev_c}, chg={chg}%")
        return {
            "value":      f"{close:,.2f}",
            "change_pct": chg,
            "up":         chg >= 0,
        }
    except Exception as e:
        print(f"Stock fetch error ({ticker}): {e}")
        return None


def _to_ticker_item(snap):
    if not snap:
        return None
    return {"value": snap["value"], "up": snap["up"]}


def _to_snapshot_row(snap, name):
    if not snap:
        return {"name": name, "value": "—", "change": "—", "up": True}
    return {
        "name":   name,
        "value":  snap["value"].split(".")[0],
        "change": f"{'+' if snap['up'] else ''}{snap['change_pct']}%",
        "up":     snap["up"],
    }


def build_market_data():
    """
    All free-tier safe ETF proxies:
      SPY  → S&P 500
      QQQ  → NASDAQ
      DIA  → DOW
      VIXY → VIX
      IBIT → Bitcoin ETF
      GLD  → Gold ETF
    """
    print("Fetching market data from Massive...")
    spy  = fetch_stock("SPY")
    qqq  = fetch_stock("QQQ")
    dia  = fetch_stock("DIA")
    vixy = fetch_stock("VIXY")
    ibit = fetch_stock("IBIT")
    gld  = fetch_stock("GLD")

    # Market open: SPY has today's volume if market traded today
    market_open = False
    try:
        raw = massive_get("/v2/snapshot/locale/us/markets/stocks/tickers/SPY")
        market_open = (raw.get("ticker", {}).get("day", {}).get("v") or 0) > 0
    except Exception:
        pass

    return {
        "ticker": {
            "spx":        _to_ticker_item(spy),
            "ndx":        _to_ticker_item(qqq),
            "btc":        _to_ticker_item(ibit),
            "gold":       _to_ticker_item(gld),
            "marketOpen": market_open,
        },
        "snapshot": [
            _to_snapshot_row(spy,  "S&P 500"),
            _to_snapshot_row(qqq,  "NASDAQ"),
            _to_snapshot_row(dia,  "DOW"),
            _to_snapshot_row(vixy, "VIX"),
        ],
    }


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


def build_message(req: ChatRequest) -> str:
    lines = []
    if req.profile and any([req.profile.risk, req.profile.goal, req.profile.horizon]):
        parts = []
        if req.profile.risk:      parts.append(f"risk tolerance: {req.profile.risk}")
        if req.profile.goal:      parts.append(f"investment goal: {req.profile.goal}")
        if req.profile.horizon:   parts.append(f"time horizon: {req.profile.horizon}")
        if req.profile.portfolio: parts.append(f"stated portfolio size: {req.profile.portfolio}")
        lines.append("User profile — " + ", ".join(parts) + ".")
    if req.holdings:
        total = sum(h.value for h in req.holdings)
        parts = [f"{h.ticker} (${h.value:,.0f}, {round(h.value/total*100)}%)" for h in req.holdings]
        lines.append(f"Current portfolio (total ${total:,.0f}): " + ", ".join(parts) + ".")
    if lines:
        return "\n".join(lines) + "\n\n" + req.message
    return req.message


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/api/market-data")
def market_data():
    now = time.time()
    if market_cache["data"] and now - market_cache["fetched_at"] < 60:
        print("Returning cached market data")
        return market_cache["data"]
    data = build_market_data()
    market_cache["data"]       = data
    market_cache["fetched_at"] = now
    return data


@app.post("/new-session")
def new_session():
    return {"session_id": str(uuid.uuid4())}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    token     = get_iam_token()
    thread_id = thread_store.get(req.session_id)

    body = {"message": {"role": "user", "content": build_message(req)}, "agent_id": AGENT_ID}
    if thread_id:
        body["thread_id"] = thread_id

    url = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/runs?stream=false"
    print(f"URL: {url}\nAGENT_ID: {AGENT_ID}")

    try:
        response = requests.post(
            url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"},
            json=body, timeout=60
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    data          = response.json()
    new_thread_id = data.get("thread_id")
    run_id        = data.get("run_id")
    if not run_id:
        raise HTTPException(status_code=500, detail=f"No run_id returned: {data}")

    thread_store[req.session_id] = new_thread_id
    poll_url = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/runs/{run_id}"

    for i in range(60):
        time.sleep(2)
        try:
            poll_response = requests.get(
                poll_url,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                timeout=30
            )
        except requests.exceptions.RequestException as e:
            raise HTTPException(status_code=500, detail=f"Polling error: {str(e)}")

        if poll_response.status_code != 200:
            raise HTTPException(status_code=poll_response.status_code, detail=poll_response.text)

        poll_data = poll_response.json()
        status    = poll_data.get("status")
        print(f"Poll {i+1}: status = {status}")

        if status == "completed":
            try:
                reply = poll_data["result"]["data"]["message"]["content"][0].get("text", "No response")
            except (KeyError, IndexError, TypeError):
                reply = "No response"
            return ChatResponse(session_id=req.session_id, reply=reply, thread_id=new_thread_id)

        elif status == "failed":
            print("Run failed:", poll_data)
            raise HTTPException(status_code=500, detail="Agent run failed")

    raise HTTPException(status_code=504, detail="Agent timed out")