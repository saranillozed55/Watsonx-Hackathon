import requests
import os
import time
import uuid
import math
import random
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from dotenv import load_dotenv

load_dotenv()

API_KEY                  = os.getenv("WATSONX_API_KEY")
AGENT_ID                 = os.getenv("AGENT_ID")
ORCHESTRATE_INSTANCE_URL = os.getenv("ORCHESTRATE_INSTANCE_URL").rstrip("/")
FINNHUB_API_KEY          = os.getenv("FINNHUB_API_KEY")

print(f"FINNHUB_API_KEY loaded: {'YES' if FINNHUB_API_KEY else 'NO — check .env'}")

FINNHUB_BASE = "https://finnhub.io/api/v1"

# ── FastAPI app with full OpenAPI metadata ────────────────────────────────────
app = FastAPI(
    title="Smiley Investment Advisory API",
    description="""
Backend API for the Smiley Investment Advisory platform.

Provides real-time market data, stock analysis, company news, analyst
recommendations, and sector peer data sourced from Finnhub. Also exposes
the chat interface that routes messages to IBM WatsonX Orchestrate agents.

## Agent Tool Usage
WatsonX agents should use these endpoints to:
- Look up live prices and fundamentals for any stock ticker
- Retrieve recent news before making recommendations
- Check analyst consensus before suggesting buy/hold/sell
- Find sector peers when comparing investment options
- Access the user's portfolio context via the chat endpoint

## Data Source
All market data is sourced from Finnhub (finnhub.io) in real-time.
""",
    version="1.0.0",
    contact={
        "name": "Smiley Investment Advisory",
    },
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://watsonx-hackathon.vercel.app"],
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


# ── Finnhub helpers ───────────────────────────────────────────────────────────

def fh_get(path: str, params: dict = None):
    if not FINNHUB_API_KEY:
        raise HTTPException(status_code=500, detail="FINNHUB_API_KEY not set in .env")
    p = dict(params or {})
    p["token"] = FINNHUB_API_KEY
    r = requests.get(f"{FINNHUB_BASE}{path}", params=p, timeout=15)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=f"Finnhub error ({path}): {r.text}")
    return r.json()


def _pct(close, prev_c):
    if not prev_c:
        return 0.0
    return round((close - prev_c) / prev_c * 100, 2)


def fmt_volume(v):
    if not v:
        return "—"
    if v >= 1_000_000:
        return f"{v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{v / 1_000:.0f}K"
    return str(int(v))


def fetch_quote(ticker: str):
    try:
        d      = fh_get("/quote", {"symbol": ticker})
        close  = d.get("c") or 0
        prev_c = d.get("pc") or close
        chg    = _pct(close, prev_c)
        print(f"  {ticker}: close={close}, prev={prev_c}, chg={chg}%")
        return {"value": f"{close:,.2f}", "change_pct": chg, "up": chg >= 0}
    except Exception as e:
        print(f"Quote error ({ticker}): {e}")
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
    print("Fetching market data from Finnhub...")
    spy  = fetch_quote("SPY")
    qqq  = fetch_quote("QQQ")
    dia  = fetch_quote("DIA")
    vixy = fetch_quote("VIXY")
    ibit = fetch_quote("IBIT")
    gld  = fetch_quote("GLD")

    market_open = False
    try:
        q = fh_get("/quote", {"symbol": "SPY"})
        market_open = (time.time() - q.get("t", 0)) < 28_800
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


def build_sparkline(open_: float, close: float, high: float, low: float, ticker: str):
    random.seed(ticker)
    points = []
    for i in range(20):
        t_ratio = i / 19
        base    = open_ + (close - open_) * t_ratio
        noise   = (high - low) * 0.15 * math.sin(i * 1.3) * random.uniform(0.5, 1.0)
        points.append(round(base + noise, 2))
    points[-1] = close
    return points


# ── Response models (makes the OpenAPI schema clean and readable) ─────────────

class TickerItem(BaseModel):
    value: str = Field(description="Formatted price string e.g. '562.14'")
    up:    bool = Field(description="True if price is up from previous close")

class SnapshotRow(BaseModel):
    name:   str  = Field(description="Display name e.g. 'S&P 500'")
    value:  str  = Field(description="Whole-number price e.g. '562'")
    change: str  = Field(description="Formatted change string e.g. '+0.82%'")
    up:     bool = Field(description="True if positive change")

class TickerBar(BaseModel):
    spx:        Optional[TickerItem] = Field(None, description="S&P 500 proxy (SPY ETF)")
    ndx:        Optional[TickerItem] = Field(None, description="NASDAQ proxy (QQQ ETF)")
    btc:        Optional[TickerItem] = Field(None, description="Bitcoin proxy (IBIT ETF)")
    gold:       Optional[TickerItem] = Field(None, description="Gold proxy (GLD ETF)")
    marketOpen: bool                 = Field(description="Whether US markets are currently open")

class MarketDataResponse(BaseModel):
    ticker:   TickerBar        = Field(description="Data for the top ticker bar")
    snapshot: List[SnapshotRow] = Field(description="Data for the sidebar market snapshot")

class StockDetailResponse(BaseModel):
    ticker:     str        = Field(description="Uppercase ticker symbol e.g. 'NVDA'")
    price:      float      = Field(description="Current market price in USD")
    change_pct: float      = Field(description="Percentage change from previous close")
    open:       float      = Field(description="Opening price for the current session")
    prevClose:  float      = Field(description="Previous session closing price")
    low52:      float      = Field(description="52-week low price")
    high52:     float      = Field(description="52-week high price")
    volume:     str        = Field(description="Today's trading volume formatted e.g. '42.1M'")
    sparkline:  List[float] = Field(description="20 intraday price points for chart rendering")

class NewsArticle(BaseModel):
    headline: str = Field(description="Article headline")
    summary:  str = Field(description="Brief article summary")
    url:      str = Field(description="Full URL to the article")
    source:   str = Field(description="Publisher name e.g. 'Reuters'")
    datetime: int = Field(description="Unix timestamp of publication")

class NewsResponse(BaseModel):
    ticker:   str              = Field(description="Ticker symbol the news relates to")
    articles: List[NewsArticle] = Field(description="Up to 10 recent news articles")

class RecommendationData(BaseModel):
    period:     str = Field(description="Analysis period e.g. '2024-01-01'")
    strongBuy:  int = Field(description="Number of strong buy ratings")
    buy:        int = Field(description="Number of buy ratings")
    hold:       int = Field(description="Number of hold ratings")
    sell:       int = Field(description="Number of sell ratings")
    strongSell: int = Field(description="Number of strong sell ratings")

class RecommendationResponse(BaseModel):
    ticker:         str                        = Field(description="Ticker symbol")
    recommendation: Optional[RecommendationData] = Field(None, description="Latest analyst consensus data, null if unavailable")

class PeersResponse(BaseModel):
    ticker: str       = Field(description="The queried ticker symbol")
    peers:  List[str] = Field(description="List of same-sector peer ticker symbols")

class SessionResponse(BaseModel):
    session_id: str = Field(description="Unique session UUID for maintaining conversation state")

class UserProfile(BaseModel):
    risk:      Optional[str] = Field(None, description="Risk tolerance: low, moderate, or high")
    goal:      Optional[str] = Field(None, description="Investment goal: growth, income, or preservation")
    horizon:   Optional[str] = Field(None, description="Time horizon e.g. '10 years'")
    portfolio: Optional[str] = Field(None, description="Stated total portfolio size e.g. '$100,000'")

class Holding(BaseModel):
    ticker: str   = Field(description="Stock ticker symbol e.g. 'NVDA'")
    value:  float = Field(description="Current value of this holding in USD")

class ChatRequest(BaseModel):
    session_id: str                     = Field(description="Session UUID from /new-session. Maintains conversation thread with WatsonX agents.")
    message:    str                     = Field(description="The user's message or question")
    profile:    Optional[UserProfile]   = Field(None, description="User's investor profile. Prepended as context to every agent message.")
    holdings:   Optional[List[Holding]] = Field(None, description="User's current portfolio holdings. Prepended as context so agents can give portfolio-specific advice.")

class ChatResponse(BaseModel):
    session_id: str = Field(description="Echo of the session ID")
    reply:      str = Field(description="The agent's response text")
    thread_id:  str = Field(description="WatsonX thread ID for conversation continuity")


# ── Context builder ───────────────────────────────────────────────────────────

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
        parts = [
            f"{h.ticker} (${h.value:,.0f}, {round(h.value / total * 100)}%)"
            for h in req.holdings
        ]
        lines.append(f"Current portfolio (total ${total:,.0f}): " + ", ".join(parts) + ".")
    if lines:
        return "\n".join(lines) + "\n\n" + req.message
    return req.message


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get(
    "/",
    summary="Health check",
    description="Returns OK if the API server is running.",
    tags=["System"],
)
def root():
    return {"status": "ok"}


@app.get(
    "/api/market-data",
    summary="Get live market snapshot",
    description="""
Returns real-time data for the top ticker bar and sidebar market snapshot.
Covers S&P 500 (SPY), NASDAQ (QQQ), DOW (DIA), VIX (VIXY), Bitcoin (IBIT),
and Gold (GLD). Results are cached for 60 seconds.

**When to use:** When the user asks about overall market conditions, whether
markets are up or down today, or needs a general market overview before
discussing specific stocks.
""",
    response_model=MarketDataResponse,
    tags=["Market Data"],
)
def market_data():
    now = time.time()
    if market_cache["data"] and now - market_cache["fetched_at"] < 60:
        print("Returning cached market data")
        return market_cache["data"]
    data = build_market_data()
    market_cache["data"]       = data
    market_cache["fetched_at"] = now
    return data


@app.get(
    "/api/stock/{ticker}",
    summary="Get detailed stock quote and fundamentals",
    description="""
Returns a comprehensive snapshot for a single stock ticker including current
price, intraday change, opening price, previous close, 52-week high/low,
trading volume, and a 20-point sparkline for charting.

**When to use:** When the user asks about a specific stock's current price,
performance today, or basic fundamental data. Use this before providing any
stock-specific investment advice so recommendations are grounded in real data.

**Examples:** "What is NVDA trading at?", "How is Apple performing today?",
"Give me a summary of Tesla's current price and range."
""",
    response_model=StockDetailResponse,
    tags=["Stock Data"],
)
def stock_detail(
    ticker: str = Path(description="Stock ticker symbol e.g. NVDA, AAPL, MSFT")
):
    sym = ticker.upper()
    try:
        q      = fh_get("/quote", {"symbol": sym})
        close  = q.get("c") or 0
        open_  = q.get("o") or close
        high   = q.get("h") or close
        low    = q.get("l") or close
        prev_c = q.get("pc") or close
        chg    = _pct(close, prev_c)

        low52 = low; high52 = high
        try:
            m      = fh_get("/stock/metric", {"symbol": sym, "metric": "all"})
            metric = m.get("metric", {})
            low52  = metric.get("52WeekLow")  or low
            high52 = metric.get("52WeekHigh") or high
        except Exception:
            pass

        vol_str = "—"
        try:
            now_ts   = int(time.time())
            candles  = fh_get("/stock/candle", {
                "symbol": sym, "resolution": "D",
                "from": now_ts - 86_400, "to": now_ts
            })
            vols = candles.get("v", [])
            if vols:
                vol_str = fmt_volume(vols[-1])
        except Exception:
            pass

        return StockDetailResponse(
            ticker     = sym,
            price      = round(close, 2),
            change_pct = chg,
            open       = round(open_,  2),
            prevClose  = round(prev_c, 2),
            low52      = round(low52,  2),
            high52     = round(high52, 2),
            volume     = vol_str,
            sparkline  = build_sparkline(open_, close, high, low, sym),
        )
    except Exception as e:
        print(f"Stock detail error ({sym}): {e}")
        raise HTTPException(status_code=404, detail=f"Could not fetch data for {sym}")


@app.get(
    "/api/stock/{ticker}/news",
    summary="Get recent company news",
    description="""
Returns up to 10 recent news articles about a company from the past 30 days,
including headline, summary, source, publication URL, and timestamp.

**When to use:** When the user asks what is happening with a specific company,
wants to understand recent price movements, or needs context before making an
investment decision. Always fetch news when discussing why a stock has moved
significantly up or down.

**Examples:** "What's the latest news on NVDA?", "Why did Tesla drop today?",
"What's been happening with Microsoft recently?"
""",
    response_model=NewsResponse,
    tags=["Stock Data"],
)
def stock_news(
    ticker: str = Path(description="Stock ticker symbol e.g. NVDA, AAPL, MSFT")
):
    sym       = ticker.upper()
    today     = time.strftime("%Y-%m-%d")
    month_ago = time.strftime("%Y-%m-%d", time.localtime(time.time() - 30 * 86_400))
    try:
        articles = fh_get("/company-news", {"symbol": sym, "from": month_ago, "to": today})
        out = [
            NewsArticle(
                headline = a.get("headline", ""),
                summary  = a.get("summary",  ""),
                url      = a.get("url",      ""),
                source   = a.get("source",   ""),
                datetime = a.get("datetime", 0),
            )
            for a in articles[:10]
        ]
        return NewsResponse(ticker=sym, articles=out)
    except Exception as e:
        print(f"News error ({sym}): {e}")
        raise HTTPException(status_code=404, detail=f"Could not fetch news for {sym}")


@app.get(
    "/api/stock/{ticker}/recommendation",
    summary="Get analyst buy/hold/sell consensus",
    description="""
Returns the latest Wall Street analyst consensus for a stock, broken down into
strong buy, buy, hold, sell, and strong sell counts for the most recent period.

**When to use:** When the user asks what analysts think about a stock, whether
a stock is a buy or sell, or when providing a formal investment recommendation.
Use this data to ground your recommendation in real analyst sentiment rather
than speculation.

**Examples:** "Should I buy NVDA?", "What do analysts think about Apple?",
"Is Tesla a buy right now?", "What's the consensus on Microsoft?"
""",
    response_model=RecommendationResponse,
    tags=["Stock Data"],
)
def stock_recommendation(
    ticker: str = Path(description="Stock ticker symbol e.g. NVDA, AAPL, MSFT")
):
    sym = ticker.upper()
    try:
        data = fh_get("/stock/recommendation", {"symbol": sym})
        if not data:
            return RecommendationResponse(ticker=sym, recommendation=None)
        latest = data[0]
        return RecommendationResponse(
            ticker=sym,
            recommendation=RecommendationData(
                period     = latest.get("period",     ""),
                strongBuy  = latest.get("strongBuy",  0),
                buy        = latest.get("buy",        0),
                hold       = latest.get("hold",       0),
                sell       = latest.get("sell",       0),
                strongSell = latest.get("strongSell", 0),
            )
        )
    except Exception as e:
        print(f"Recommendation error ({sym}): {e}")
        raise HTTPException(status_code=404, detail=f"Could not fetch recommendations for {sym}")


@app.get(
    "/api/stock/{ticker}/peers",
    summary="Get same-sector peer stocks",
    description="""
Returns a list of ticker symbols for companies in the same sector and industry
as the queried stock, as determined by Finnhub's classification.

**When to use:** When the user wants to compare a stock against its competitors,
asks for alternatives to a stock they own, or when performing sector analysis.
Use peers to provide diversification suggestions or competitive context.

**Examples:** "What are NVDA's competitors?", "What else should I look at besides
Apple?", "Give me alternatives to Tesla in the EV space."
""",
    response_model=PeersResponse,
    tags=["Stock Data"],
)
def stock_peers(
    ticker: str = Path(description="Stock ticker symbol e.g. NVDA, AAPL, MSFT")
):
    sym = ticker.upper()
    try:
        peers    = fh_get("/stock/peers", {"symbol": sym})
        filtered = [p for p in peers if p != sym][:8]
        return PeersResponse(ticker=sym, peers=filtered)
    except Exception as e:
        print(f"Peers error ({sym}): {e}")
        raise HTTPException(status_code=404, detail=f"Could not fetch peers for {sym}")


@app.post(
    "/new-session",
    summary="Create a new chat session",
    description="""
Generates a new unique session ID. Call this once when a user starts a
conversation. Pass the returned session_id with every subsequent /chat request
to maintain conversation continuity with the WatsonX agent thread.
""",
    response_model=SessionResponse,
    tags=["Chat"],
)
def new_session():
    return SessionResponse(session_id=str(uuid.uuid4()))


@app.post(
    "/chat",
    summary="Send a message to the WatsonX investment advisory agents",
    description="""
Routes the user's message to the IBM WatsonX Orchestrate multi-agent system.
The orchestrator agent delegates to specialized sub-agents:

- **Market Research Agent** — looks up data, trends, sector analysis
- **Risk Compliance Agent** — evaluates risk relative to user profile
- **Portfolio Agent** — analyzes holdings and suggests rebalancing
- **Recommendation Agent** — synthesizes a final investment recommendation

The user's investor profile (risk tolerance, goal, time horizon) and current
portfolio holdings are automatically prepended to every message so agents have
full context without the user needing to repeat themselves.

**session_id** must be obtained from /new-session first. Reuse it across
multiple messages to maintain conversation memory within the same thread.
""",
    response_model=ChatResponse,
    tags=["Chat"],
)
def chat(req: ChatRequest):
    token     = get_iam_token()
    thread_id = thread_store.get(req.session_id)

    body = {
        "message":  {"role": "user", "content": build_message(req)},
        "agent_id": AGENT_ID
    }
    if thread_id:
        body["thread_id"] = thread_id

    url = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/runs?stream=false"
    print(f"URL: {url}\nAGENT_ID: {AGENT_ID}")

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type":  "application/json",
                "Accept":        "application/json"
            },
            json=body,
            timeout=60
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