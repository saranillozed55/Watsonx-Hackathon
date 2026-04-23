import { useState, useRef, useEffect, useCallback } from "react";
import "../styles/FinanceAI.css";
import OnboardingModal from "../components/OnboardingModal";
import PortfolioPanel from "../components/PortfolioPanel";
import { marked } from "marked";
import InvestmentAnalysis from "./InvestmentAnalysis";
import API from "../config";
 
let _marketDataCache = null;
let _marketDataFetchedAt = 0;
 
async function fetchMarketData() {
  const now = Date.now();
  if (_marketDataCache && now - _marketDataFetchedAt < 65_000) return _marketDataCache;
  try {
    const res = await fetch(`${API}/api/market-data`);
    if (!res.ok) throw new Error(`Market data error: ${res.status}`);
    const data = await res.json();
    _marketDataCache = data;
    _marketDataFetchedAt = now;
    return data;
  } catch (err) {
    console.warn("Market data fetch failed:", err);
    return null;
  }
}
 
async function fetchTickerData() {
  const data = await fetchMarketData();
  return data?.ticker ?? null;
}
 
async function fetchMarketSnapshot() {
  const data = await fetchMarketData();
  return data?.snapshot ?? null;
}
 
async function sendToBackend(sessionId, message) {
  const storedProfile  = localStorage.getItem("userProfile");
  const storedHoldings = localStorage.getItem("portfolio");
 
  const res = await fetch(`${API}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      profile:  storedProfile  ? JSON.parse(storedProfile)  : null,
      holdings: storedHoldings ? JSON.parse(storedHoldings) : null,
    }),
  });
 
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Backend error: ${res.status}`);
  }
  return res.json();
}
 
// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
 
const SIDEBAR_TOPICS = [
  { label: "Portfolio Strategy",  key: "portfolio" },
  { label: "Stock Analysis",      key: "stocks"    },
  { label: "ETFs & Index Funds",  key: "etf"       },
  { label: "Crypto Assets",       key: "crypto"    },
  { label: "Bonds & Fixed Income",key: "bonds"     },
  { label: "Risk Management",     key: "risk"      },
  { label: "Tax & Retirement",    key: "tax"       },
];
 
const TOPIC_QUERIES = {
  portfolio: "portfolio strategy",
  stocks:    "stock analysis",
  etf:       "explain etfs",
  crypto:    "crypto assets",
  bonds:     "bonds and fixed income",
  risk:      "how to manage investment risk",
  tax:       "tax and retirement",
};
 
const HOME_SUGGESTIONS = [
  "portfolio strategy",
  "stock analysis",
  "risk management",
  "ETFs vs index funds",
];
 
const PLACEHOLDERS = [
  "how can I help you today?",
  "ask me about your portfolio...",
  "what's your investment goal?",
  "need help managing risk?",
  "ask about a stock...",
  "how do I beat inflation?",
];
 
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
 
function getTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}

function formatBytes(b) {
  if (b < 1024)    return b + "B";
  if (b < 1048576) return (b / 1024).toFixed(1) + "KB";
  return (b / 1048576).toFixed(1) + "MB";
}

function getFileIcon(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "🖼️";
  if (ext === "pdf")  return "📄";
  if (["csv","xlsx","xls"].includes(ext)) return "📊";
  if (["txt","md"].includes(ext))  return "📝";
  if (ext === "json") return "🗂️";
  return "📁";
}
 
// ─────────────────────────────────────────────────────────────────────────────
// CANVAS CHART
// ─────────────────────────────────────────────────────────────────────────────
 
const chartDataCache = {};
 
function drawChartBase(el, data, lineColor) {
  const W = el.offsetWidth || 500, H = 150;
  el.width = W; el.height = H;
  const ctx = el.getContext("2d");
  const P = { t: 10, r: 38, b: 18, l: 6 };
  const cW = W - P.l - P.r, cH = H - P.t - P.b;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const xOf = i => P.l + i / (data.length - 1) * cW;
  const yOf = v => P.t + cH - (v - mn) / rng * cH;
 
  const grad = ctx.createLinearGradient(0, P.t, 0, P.t + cH);
  if (lineColor === "#4ade80") {
    grad.addColorStop(0, "rgba(74,222,128,0.28)");
    grad.addColorStop(0.75, "rgba(74,222,128,0.04)");
    grad.addColorStop(1, "rgba(74,222,128,0)");
  } else {
    grad.addColorStop(0, "rgba(248,113,113,0.28)");
    grad.addColorStop(0.75, "rgba(248,113,113,0.04)");
    grad.addColorStop(1, "rgba(248,113,113,0)");
  }
 
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(data[0]));
  for (let i = 1; i < data.length; i++) {
    const cx = (xOf(i-1) + xOf(i)) / 2;
    ctx.bezierCurveTo(cx, yOf(data[i-1]), cx, yOf(data[i]), xOf(i), yOf(data[i]));
  }
  ctx.lineTo(xOf(data.length - 1), P.t + cH);
  ctx.lineTo(xOf(0), P.t + cH);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
 
  ctx.beginPath();
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.moveTo(xOf(0), yOf(data[0]));
  for (let i = 1; i < data.length; i++) {
    const cx = (xOf(i-1) + xOf(i)) / 2;
    ctx.bezierCurveTo(cx, yOf(data[i-1]), cx, yOf(data[i]), xOf(i), yOf(data[i]));
  }
  ctx.stroke();
 
  for (let t = 0; t <= 3; t++) {
    const v = mn + rng * (t / 3), y = yOf(v);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y); ctx.stroke();
    ctx.fillStyle = "#555"; ctx.font = "9px IBM Plex Mono"; ctx.textAlign = "left";
    ctx.fillText("$" + parseFloat(v).toFixed(0), W - P.r + 3, y + 3);
  }
  return { xOf, yOf, P, W, H };
}
 
function StockChart({ stockId, stockData, initRange = "1D" }) {
  const canvasRef = useRef(null);
  const tipRef    = useRef(null);
  const [range, setRange] = useState(initRange);
  const stateRef  = useRef({});
 
  const render = useCallback((r) => {
    const el = canvasRef.current; if (!el) return;
    const data   = stockData?.chartData?.[r]   || [];
    const labels = stockData?.chartLabels?.[r] || [];
    if (!data.length) return;
    const isUp = data[data.length - 1] >= data[0];
    const lc = isUp ? "#4ade80" : "#f87171";
    drawChartBase(el, data, lc);
    stateRef.current = { data, labels, lc };
  }, [stockData]);
 
  useEffect(() => { render(range); }, [range, render]);
 
  function handleMouseMove(e) {
    const el = canvasRef.current; if (!el) return;
    const { data, labels, lc } = stateRef.current; if (!data?.length) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { xOf, yOf, P, W, H } = drawChartBase(el, data, lc);
    const idx = Math.max(0, Math.min(data.length - 1, Math.round((mx - P.l) / (W - P.l - P.r) * (data.length - 1))));
    const px = xOf(idx), py = yOf(data[idx]);
    const ctx = el.getContext("2d");
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, P.t); ctx.lineTo(px, H - P.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P.l, py); ctx.lineTo(W - P.r, py); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = lc; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    if (tipRef.current) {
      tipRef.current.innerHTML = `<span class="tip-label">${labels[idx] || ""}</span><br><span class="tip-val">$${parseFloat(data[idx]).toFixed(2)}</span>`;
      tipRef.current.style.display = "block";
      let tx = px + 10; if (tx + 110 > W) tx = px - 118;
      tipRef.current.style.left = tx + "px";
      tipRef.current.style.top  = Math.max(P.t, py - 30) + "px";
    }
  }
 
  function handleMouseLeave() {
    const { data, lc } = stateRef.current;
    if (data?.length && canvasRef.current) drawChartBase(canvasRef.current, data, lc);
    if (tipRef.current) tipRef.current.style.display = "none";
  }
 
  return (
    <div>
      <div className="range-tabs">
        {["1D","5D","1M","6M","1Y","5Y"].map(r => (
          <button key={r} className={`range-tab${r === range ? " active" : ""}`} onClick={() => setRange(r)}>{r}</button>
        ))}
      </div>
      <div className="chart-outer">
        <canvas ref={canvasRef} className="chart-canvas" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
        {(!stockData?.chartData?.[range]?.length) && <div className="chart-loading">loading chart data…</div>}
        <div ref={tipRef} className="ch-tip" style={{ display: "none" }} />
      </div>
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// STOCK CARD
// ─────────────────────────────────────────────────────────────────────────────
 
function StockCard({ stock, msgId }) {
  if (!stock) return null;
  const isUp   = stock.chg  >= 0;
  const ahIsUp = stock.ahChg >= 0;
  const fmt = n => parseFloat(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 
  return (
    <div className="stock-card">
      <div className="stock-ticker-name">{stock.ticker} · {stock.name}</div>
      <div className="stock-price">${fmt(stock.price)}</div>
      <div className={`stock-change ${isUp ? "up" : "dn"}`}>
        {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{parseFloat(stock.chg).toFixed(2)} ({isUp ? "+" : ""}{parseFloat(stock.chgPct).toFixed(2)}%) · Today
      </div>
      <div className="stock-after">
        ${parseFloat(stock.ahPrice).toFixed(2)}{" "}
        <span style={{ color: ahIsUp ? "var(--green)" : "var(--red)" }}>
          {ahIsUp ? "+" : ""}{parseFloat(stock.ahChg).toFixed(2)} ({ahIsUp ? "+" : ""}{parseFloat(stock.ahChgPct).toFixed(2)}%)
        </span>{" "}
        <span style={{ fontSize: "10px" }}>After Hours</span>
      </div>
      <StockChart stockId={String(msgId)} stockData={stock} />
      <div className="stock-stats">
        {[
          ["Open", stock.open], ["Day Low", stock.dayLow], ["Day High", stock.dayHigh],
          ["Volume", stock.vol], ["Mkt Cap", stock.mktCap], ["P/E Ratio", stock.pe],
          ["52W Low", stock.yearLow], ["52W High", stock.yearHigh], ["EPS (TTM)", stock.eps],
        ].map(([k, v]) => (
          <div className="stat-item" key={k}>
            <span className="stat-label">{k}</span>
            <span className="stat-val">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
 
function SmileyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <circle cx="6.5" cy="7" r="1.4" fill="#000" />
      <circle cx="11.5" cy="7" r="1.4" fill="#000" />
      <path d="M5.5 11.5 Q9 14 12.5 11.5" stroke="#000" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
 
function PaperclipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
 
function MicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0014 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8"  y1="23" x2="16" y2="23" />
    </svg>
  );
}
 
function InfoCard({ card }) {
  return (
    <div className="info-card">
      <div className="info-card-title">{card.title}</div>
      <div className="info-card-grid">
        {card.items.map(([k, v]) => (
          <div className="ic-item" key={k}>
            <div className="ic-label">{k}</div>
            <div className="ic-val">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
 
function TypingIndicator() {
  return (
    <div className="msg-wrap">
      <div className="msg-row">
        <div className="msg-av ai-av"><SmileyIcon /></div>
        <div className="msg-content">
          <div className="msg-meta"><span className="msg-name">Smiley</span></div>
          <div className="typing-dots">
            <div className="t-dot" /><div className="t-dot" /><div className="t-dot" />
          </div>
        </div>
      </div>
    </div>
  );
}
 
function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className="msg-wrap">
      <div className={`msg-row${isUser ? " user" : ""}`}>
        <div className={`msg-av ${isUser ? "user-av" : "ai-av"}`}>
          {isUser ? "you" : <SmileyIcon />}
        </div>
        <div className="msg-content">
          <div className={`msg-meta${isUser ? " user-meta" : ""}`}>
            <span className="msg-name">{isUser ? "you" : "Smiley"}</span>
            <span className="msg-time">{msg.time}</span>
          </div>
          {isUser ? (
            <div className="user-bubble-wrap">
              <div className="msg-bubble">
                {msg.imageDataUrl && <img className="msg-img" src={msg.imageDataUrl} alt="uploaded" />}
                {msg.filePreview  && <pre className="file-content-preview">{msg.filePreview}</pre>}
                {msg.paragraphs.map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: p }} />)}
              </div>
            </div>
          ) : (
            <>
              <div className="msg-bubble msg-markdown" dangerouslySetInnerHTML={{ __html: marked.parse(msg.paragraphs.join("\n\n")) }} />
              {msg.stock && <StockCard stock={msg.stock} msgId={msg.id} />}
              {msg.card  && <InfoCard card={msg.card} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// TICKER
// ─────────────────────────────────────────────────────────────────────────────
 
function Ticker() {
  const [data, setData] = useState(null);
 
  useEffect(() => {
    fetchTickerData().then(d => { if (d) setData(d); });
    const id = setInterval(() => { fetchTickerData().then(d => { if (d) setData(d); }); }, 60_000);
    return () => clearInterval(id);
  }, []);
 
  const Item = ({ label, item }) => (
    <div className="tick-item">
      <span className="tick-label">{label}</span>
      {item ? (
        <><span className={item.up ? "tick-up" : "tick-dn"}>{item.up ? "▲" : "▼"}</span><span className="tick-val">{item.value}</span></>
      ) : (
        <span className="tick-val" style={{ color: "var(--text-muted)" }}>—</span>
      )}
    </div>
  );
 
  const STATUS = {
    "open":        { label: "MARKETS OPEN",   cls: " open",        dot: " open"        },
    "pre-market":  { label: "PRE-MARKET",     cls: " pre-market",  dot: " pre-market"  },
    "after-hours": { label: "AFTER HOURS",    cls: " after-hours", dot: " after-hours" },
    "closed":      { label: "MARKETS CLOSED", cls: "",             dot: ""             },
  };
  const s = STATUS[data?.marketStatus] ?? STATUS["closed"];
 
  return (
    <div className="ticker-bar">
      <span className="ticker-left">FinanceAI</span>
      <div className="ticker-center">
        <Item label="SPX"  item={data?.spx}  />
        <Item label="NDX"  item={data?.ndx}  />
        <Item label="BTC"  item={data?.btc}  />
        <Item label="GOLD" item={data?.gold} />
      </div>
      <div className={`markets-badge${s.cls}`}>
        <div className={`markets-dot${s.dot}`} />
        {data ? s.label : "—"}
      </div>
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// MARKET SNAPSHOT
// ─────────────────────────────────────────────────────────────────────────────
 
function MarketSnapshot() {
  const [rows, setRows] = useState(null);
 
  useEffect(() => {
    fetchMarketSnapshot().then(d => { if (d) setRows(d); });
    const id = setInterval(() => { fetchMarketSnapshot().then(d => { if (d) setRows(d); }); }, 60_000);
    return () => clearInterval(id);
  }, []);
 
  return (
    <div className="market-snapshot">
      <div className="snapshot-title">Market Snapshot</div>
      {rows ? rows.map(row => (
        <div className="snap-row" key={row.name}>
          <span className="snap-name">{row.name}</span>
          <span className="snap-val">{row.value}</span>
          <span className={`snap-chg ${row.up ? "snap-up" : "snap-dn"}`}>{row.change}</span>
        </div>
      )) : (
        // skeleton while loading
        ["S&P 500","NASDAQ","DOW","VIX"].map(n => (
          <div className="snap-row" key={n}>
            <span className="snap-name">{n}</span>
            <span className="snap-val skel" style={{ width: "44px", height: "12px", display: "inline-block" }} />
            <span className="snap-chg skel" style={{ width: "36px", height: "12px", display: "inline-block" }} />
          </div>
        ))
      )}
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION STORAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
 
const MAX_CONVERSATIONS    = 8;
const MAX_MESSAGES_PER_CONV = 30;
 
function loadConvsFromStorage() {
  try { return JSON.parse(localStorage.getItem("conversations") || "[]"); }
  catch { return []; }
}
 
function saveConvsToStorage(convs) {
  try {
    const lean = convs.map(c => ({
      ...c,
      messages: c.messages.slice(-MAX_MESSAGES_PER_CONV).map(m => ({
        ...m,
        imageDataUrl: m.imageDataUrl ? "[image]" : null,
      })),
    }));
    localStorage.setItem("conversations", JSON.stringify(lean));
  } catch {
    localStorage.removeItem("conversations");
  }
}
 
// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
 
export default function FinanceAI() {
  const [messages,      setMessages]      = useState([]);
  const [chatInput,     setChatInput]     = useState("");
  const [homeInput,     setHomeInput]     = useState("");
  const [typing,        setTyping]        = useState(false);
  const [chatStarted,   setChatStarted]   = useState(false);
  const [activeTopic,   setActiveTopic]   = useState(null);
  const [phIdx,         setPhIdx]         = useState(0);
  const [phVisible,     setPhVisible]     = useState(true);
  const [dropActive,    setDropActive]    = useState(false);
  const [attachment,    setAttachment]    = useState(null);
  const [isRecording,   setIsRecording]   = useState(false);
  const [activeTab,     setActiveTab]     = useState("chat");
  const [sessionId,     setSessionId]     = useState(() => localStorage.getItem("sessionId") || null);
  const [conversations, setConversations] = useState(() => loadConvsFromStorage());
  const [userProfile,   setUserProfile]   = useState(() => {
    const s = localStorage.getItem("userProfile");
    return s ? JSON.parse(s) : null;
  });
  const [holdings, setHoldings] = useState(() => {
    const s = localStorage.getItem("portfolio");
    return s ? JSON.parse(s) : [];
  });
 
  const msgCounter     = useRef(0);
  const dragCounter    = useRef(0);
  const messagesEnd    = useRef(null);
  const chatTaRef      = useRef(null);
  const fileHomeRef    = useRef(null);
  const fileChatRef    = useRef(null);
  const recognitionRef = useRef(null);
  const pendingQueryRef = useRef(null);
 
  // ── KEY FIX: ref-based conversation ID so closures never go stale ────────
  // Every time we save, we use activeConvIdRef.current directly.
  // Generating a new ID only happens when it's null (brand new conversation).
  const activeConvIdRef = useRef(null);
 
  // ── Lock prevents topic/new-conv clicks while agent is busy ─────────────
  // Also prevents rapid clicks from queuing up multiple conversations.
  const lockedRef = useRef(false);
 
  // placeholder cycling
  useEffect(() => {
    const id = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => { setPhIdx(i => (i + 1) % PLACEHOLDERS.length); setPhVisible(true); }, 600);
    }, 5000);
    return () => clearInterval(id);
  }, []);
 
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);
 
  // Fire a pending topic query after the state has fully reset to home
  useEffect(() => {
  if (chatStarted && pendingQueryRef.current) {
    const query = pendingQueryRef.current;
    pendingQueryRef.current = null;
    send(query);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [chatStarted, messages]);
 
  // Auto-release the lock when the agent finishes (typing goes false)
  useEffect(() => {
    if (!typing) {
      const t = setTimeout(() => { lockedRef.current = false; }, 500);
      return () => clearTimeout(t);
    }
  }, [typing]);
 
  function autoResize(e) {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 90) + "px";
  }
 
  // ── Persist conversation — always upserts the SAME entry via the ref ─────
  // Root cause of duplicates was: inside setMessages() callbacks, the closure
  // captured a stale activeConvId state value (always null), so each save
  // generated a fresh conv_${Date.now()} key. Using a ref fixes this.
  function persistConversation(msgs, sid) {
    const userMsgs = msgs.filter(m => m.role === "user");
    if (userMsgs.length === 0) return;
 
    // Assign a stable ID on first save; reuse it for every subsequent save
    if (!activeConvIdRef.current) {
      activeConvIdRef.current = `conv_${Date.now()}`;
    }
    const id    = activeConvIdRef.current;
    const title = userMsgs[0].paragraphs[0]?.slice(0, 32) || "Conversation";
    const conv  = { id, title, messages: msgs, sessionId: sid, timestamp: Date.now() };
 
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id); // remove old entry for same ID
      const updated  = [conv, ...filtered].slice(0, MAX_CONVERSATIONS);
      saveConvsToStorage(updated);
      return updated;
    });
  }
 
  // ── Load a saved conversation ────────────────────────────────────────────
  function loadConversation(conv) {
    if (chatStarted && messages.filter(m => m.role === "user").length > 0) {
      persistConversation(messages, sessionId);
    }
    activeConvIdRef.current = conv.id;
    setMessages(conv.messages);
    setSessionId(conv.sessionId);
    if (conv.sessionId) localStorage.setItem("sessionId", conv.sessionId);
    else localStorage.removeItem("sessionId");
    setChatStarted(true);
    setTyping(false);
    setChatInput("");
    setHomeInput("");
    setAttachment(null);
    lockedRef.current = false;
    // Move this conversation to the top of the recents list immediately
    setConversations(prev => {
      const reordered = [conv, ...prev.filter(c => c.id !== conv.id)];
      saveConvsToStorage(reordered);
      return reordered;
    });
  }
 
  // ── Delete a conversation ────────────────────────────────────────────────
  function deleteConversation(e, convId) {
    e.stopPropagation();
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== convId);
      saveConvsToStorage(updated);
      return updated;
    });
    // If we deleted the currently open conversation, go to home
    if (activeConvIdRef.current === convId) {
      activeConvIdRef.current = null;
      setChatStarted(false);
      setMessages([]);
      setSessionId(null);
      localStorage.removeItem("sessionId");
    }
  }
 
  // ── File processing ──────────────────────────────────────────────────────
  function processFile(file) {
    const isImage = file.type.startsWith("image/");
    const isText  = file.type.startsWith("text/") || /\.(txt|md|csv|json|js|ts|py|html|css)$/i.test(file.name);

    if (isImage) {
      const reader = new FileReader();
      reader.onload = e => { setAttachment({ type: "image", name: file.name, dataUrl: e.target.result, size: file.size }); if (!chatStarted) kickoffChat(); };
      reader.readAsDataURL(file);
    } else if (isText) {
      const reader = new FileReader();
      reader.onload = e => { setAttachment({ type: "text", name: file.name, content: e.target.result, size: file.size }); if (!chatStarted) kickoffChat(); };
      reader.readAsText(file);
    } else {
      setAttachment({ type: "other", name: file.name, size: file.size });
      if (!chatStarted) kickoffChat();
    }
  }
 
  // ── Voice ────────────────────────────────────────────────────────────────
  function toggleMic() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { alert("Voice input requires Chrome or Edge."); return; }

    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }

    const rec = new SpeechRec();
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    recognitionRef.current = rec;
    setIsRecording(true);
    rec.onresult = e => {
      let final = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      const txt = final || interim;
      if (chatStarted) setChatInput(txt); else setHomeInput(txt);
    };
    rec.onend   = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);
    rec.start();
  }
 
  // ── Chat flow ────────────────────────────────────────────────────────────
  function kickoffChat() {
    setChatStarted(true);
    setMessages([{
      id: 0, role: "ai", time: getTime(),
      paragraphs: ["New conversation started. How can I help you with your investment strategy today?"],
      card: null, stock: null,
    }]);
  }
 
  async function send(text) {
    const hasText = text?.trim();
    const hasFile = !!attachment;
    if (!hasText && !hasFile) return;
    if (typing) return;
    if (!chatStarted) kickoffChat();
 
    const att = attachment;
    const id  = ++msgCounter.current;
    const userMsg = {
      id, role: "user", time: getTime(),
      paragraphs: hasText ? [text.trim()] : att ? [`Attached: ${att.name}`] : [],
      imageDataUrl: att?.type === "image" ? att.dataUrl : null,
      filePreview:  att?.type === "text"  ? att.content.slice(0, 400).replace(/</g, "&lt;") : null,
      card: null, stock: null,
    };
 
    setMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setHomeInput("");
    if (chatTaRef.current) chatTaRef.current.style.height = "auto";
    setAttachment(null);
    setTyping(true);
    lockedRef.current = true;
 
    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessionRes = await fetch(`${API}/new-session`, { method: "POST" });
        if (!sessionRes.ok) throw new Error("Failed to create session");
        const sessionData = await sessionRes.json();
        currentSessionId = sessionData.session_id;
        setSessionId(currentSessionId);
        localStorage.setItem("sessionId", currentSessionId);
      }
 
      const data = await sendToBackend(currentSessionId, text?.trim() || "");
      setTyping(false);
 
      const rid = ++msgCounter.current;
      setMessages(prev => {
        const updated = [
          ...prev,
          { id: rid, role: "ai", time: getTime(), paragraphs: [data.reply || ""], stock: null, card: null },
        ];
        // persistConversation reads activeConvIdRef.current (always fresh, no closure stale issue)
        persistConversation(updated, currentSessionId);
        return updated;
      });
    } catch (err) {
      setTyping(false);
      const rid = ++msgCounter.current;
      setMessages(prev => [
        ...prev,
        { id: rid, role: "ai", time: getTime(), paragraphs: ["Sorry, I couldn't reach the backend. Make sure it is running on port 8000."], card: null, stock: null },
      ]);
    }
  }
 
  // ── New Conversation ─────────────────────────────────────────────────────
  function newConversation() {
    if (lockedRef.current) return;
    if (chatStarted && messages.filter(m => m.role === "user").length > 0) {
      persistConversation(messages, sessionId);
    }
    localStorage.removeItem("sessionId");
    activeConvIdRef.current = null;
    setSessionId(null);
    setChatStarted(false);
    setMessages([]);
    setTyping(false);
    setChatInput("");
    setHomeInput("");
    setAttachment(null);
    setActiveTopic(null);
  }
 
  // ── Topic click — new conversation + locked while agent runs ─────────────
  function handleTopicClick(topicKey) {
  if (lockedRef.current) return;
  lockedRef.current = true;

  setActiveTopic(topicKey);
  setActiveTab("chat");
  if (chatStarted && messages.filter(m => m.role === "user").length > 0) {
    persistConversation(messages, sessionId);
  }

  localStorage.removeItem("sessionId");
  activeConvIdRef.current = null;
  setSessionId(null);
  setTyping(false);
  setChatInput("");
  setHomeInput("");
  setAttachment(null);

  const welcomeMsg = {
    id: 0, role: "ai", time: getTime(),
    paragraphs: ["New conversation started. How can I help you with your investment strategy today?"],
    card: null, stock: null,
  };
  setMessages([welcomeMsg]);
  setChatStarted(true);
  pendingQueryRef.current = TOPIC_QUERIES[topicKey];
}
 
  // ── Drag & Drop ──────────────────────────────────────────────────────────
  function onDragEnter(e) { e.preventDefault(); dragCounter.current++; setDropActive(true); }
  function onDragLeave(e) { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDropActive(false); } }
  function onDragOver(e)  { e.preventDefault(); }
  function onDrop(e)      { e.preventDefault(); dragCounter.current = 0; setDropActive(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }
 
  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
 
  return (
    <div className="finance-app" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
 
      {!userProfile && <OnboardingModal onComplete={(profile) => setUserProfile(profile)} />}
 
      <div className={`drop-overlay${dropActive ? " active" : ""}`} onClick={() => { setDropActive(false); dragCounter.current = 0; }}>
        <div className="drop-icon-wrap">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="drop-title">Add anything</div>
        <div className="drop-sub">Drop any file here to add it to the conversation</div>
      </div>
 
      <Ticker />
 
      <div className="body-row">
        <aside className="sidebar">
          <button
            className={`new-conv-btn${lockedRef.current ? " locked" : ""}`}
            onClick={newConversation}
          >
            <span style={{ fontSize: "14px", color: "var(--text-dim)" }}>+</span> New Conversation
          </button>
 
          <div className="sb-section-label">Topics</div>
          {SIDEBAR_TOPICS.map(t => (
            <div
              key={t.key}
              className={`topic-item${activeTopic === t.key ? " active" : ""}${lockedRef.current ? " topic-locked" : ""}`}
              onClick={() => handleTopicClick(t.key)}
              title={lockedRef.current ? "Agent is busy — please wait" : undefined}
            >
              <span className="topic-icon">{t.icon}</span>{t.label}
            </div>
          ))}
 
          <div className="sb-divider" />
          <div className="sb-section-label">Recent</div>
 
          {conversations.length === 0 ? (
            <div className="recent-empty">No recent conversations</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`recent-item${activeConvIdRef.current === conv.id ? " active" : ""}`}
                onClick={() => loadConversation(conv)}
                title={conv.title}
              >
                <span className="recent-item-title">
                  {conv.title?.slice(0, 20)}{conv.title?.length > 20 ? "…" : ""}
                </span>
                <button
                  className="recent-delete-btn"
                  onClick={(e) => deleteConversation(e, conv.id)}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))
          )}
 
          <div className="sb-divider" />
          <PortfolioPanel
            onPortfolioChange={(newHoldings, analyzeMessage) => {
              setHoldings(newHoldings);
              if (analyzeMessage) send(analyzeMessage);
            }}
          />
          <div className="sb-divider" />
          <MarketSnapshot />
        </aside>
 
        <div className="main">
          <div className="topbar">
            <div className="topbar-logo">
              <div className="logo-sq"><SmileyIcon size={18} /></div>
              <div>
                <span className="logo-text">Smiley</span>
                <span className="logo-sub">Investment Advisory</span>
              </div>
            </div>
            <div className="topbar-tabs">
              <button className={`topbar-tab${activeTab === "chat" ? " active" : ""}`} onClick={() => setActiveTab("chat")}>Chat</button>
              <button className={`topbar-tab${activeTab === "analysis" ? " active" : ""}`} onClick={() => setActiveTab("analysis")}>Analysis</button>
            </div>
          </div>
 
          <div className="chat-view">
            {activeTab === "analysis" ? (
              <InvestmentAnalysis />
            ) : !chatStarted ? (
              <div className="home-state">
                <div className="greeting-text">{getGreeting()}</div>
                <div className="home-input-block">
                  <div className="input-row">
                    <div className="inp-ph-wrap">
                      <input className="inp-text" type="text" value={homeInput} autoComplete="off"
                        onChange={e => setHomeInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && send(homeInput)} />
                      <span className={`fake-ph ${phVisible && !homeInput ? "fade-in" : "fade-out"}`}>
                        {PLACEHOLDERS[phIdx]}
                      </span>
                    </div>
                    <div className="input-icons">
                      <button className="icon-btn" title="Attach" onClick={() => fileHomeRef.current?.click()}><PaperclipIcon /></button>
                      <button className={`icon-btn${isRecording ? " recording" : ""}`} title="Voice" onClick={toggleMic}><MicIcon /></button>
                      <button className="send-btn" onClick={() => send(homeInput)}>↑</button>
                    </div>
                    <input ref={fileHomeRef} type="file" style={{ display: "none" }} onChange={e => { processFile(e.target.files[0]); e.target.value = ""; }} />
                  </div>
                  <div className="suggestions" style={{ padding: 0 }}>
                    {HOME_SUGGESTIONS.map(s => (
                      <button key={s} className="sugg" onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ── CHAT ── */
              <>
                <div className="messages-view">
                  {messages.map(m => <Message key={m.id} msg={m} />)}
                  {typing && <TypingIndicator />}
                  <div ref={messagesEnd} />
                </div>
 
                {attachment && (
                  <div className="attachment-area">
                    <div className="attachment-preview">
                      {attachment.type === "image"
                        ? <img className="att-thumb" src={attachment.dataUrl} alt="preview" />
                        : <div className="att-thumb-icon">{getFileIcon(attachment.name)}</div>}
                      <div className="att-info">
                        <div className="att-name">{attachment.name}</div>
                        <div className="att-meta">
                          {formatBytes(attachment.size)} · {attachment.type === "image" ? "image" : attachment.type === "text" ? "text file" : "binary — sent to backend"}
                        </div>
                      </div>
                      <div className="att-clear" onClick={() => setAttachment(null)}>×</div>
                    </div>
                  </div>
                )}
 
                {isRecording && (
                  <div className="voice-banner">
                    <div className="voice-inner"><div className="voice-dot" /><span>Listening… click mic to stop</span></div>
                  </div>
                )}
 
                <div className="suggestions">
                  {HOME_SUGGESTIONS.map(s => (
                    <button key={s} className="sugg" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
 
                <div className="chat-input-area">
                  <div className="chat-input-inner">
                    <div className="input-row"
                      onDragEnter={e => { e.preventDefault(); e.currentTarget.classList.add("drag-over-input"); }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove("drag-over-input"); }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("drag-over-input"); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}>
                      <textarea ref={chatTaRef} className="chat-ta" rows={1} value={chatInput}
                        placeholder="Ask about stocks, portfolios, investing strategies..."
                        onChange={e => { setChatInput(e.target.value); autoResize(e); }}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(chatInput); } }} />
                      <div className="input-icons">
                        <button className="icon-btn" title="Attach" onClick={() => fileChatRef.current?.click()}><PaperclipIcon /></button>
                        <button className={`icon-btn${isRecording ? " recording" : ""}`} title="Voice" onClick={toggleMic}><MicIcon /></button>
                        <button className="send-btn" onClick={() => send(chatInput)}>↑</button>
                      </div>
                      <input ref={fileChatRef} type="file" style={{ display: "none" }} onChange={e => { processFile(e.target.files[0]); e.target.value = ""; }} />
                    </div>
                  </div>
                  <div className="footer-disc">Smiley is for informational purposes only. Not financial advice. Always consult a licensed advisor.</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}