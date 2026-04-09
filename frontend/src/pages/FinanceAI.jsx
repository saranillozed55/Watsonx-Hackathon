import { useState, useRef, useEffect } from "react";
import "../styles/FinanceAI.css";

const RESPONSES = {
  portfolio: {
    text: [
      "A well-diversified portfolio is built on **asset allocation** — balancing equities, fixed income, and alternatives based on your risk tolerance and time horizon.",
      "For a moderate risk profile, a classic starting point is the **60/40 split** (60% equities, 40% bonds), though many advisors now recommend tilting toward equities for long-term growth."
    ],
    card: {
      title: "Sample Portfolio Allocation",
      items: [["US Equities","40%"],["Intl Equities","20%"],["Bonds","25%"],["REITs","10%"]]
    }
  },
  stocks: {
    text: [
      "When analyzing individual stocks, focus on both **fundamental** and **technical** metrics.",
      "Key fundamentals include P/E ratio, revenue growth, free cash flow, and debt-to-equity. In 2026, sectors showing strong momentum include **AI infrastructure**, **energy transition**, and **healthcare innovation**."
    ],
    card: {
      title: "Key Metrics to Watch",
      items: [["P/E Ratio","< 25"],["EPS Growth","> 15% YoY"],["Debt/Equity","< 1.0"],["FCF Yield","> 3%"]]
    }
  },
  etf: {
    text: [
      "ETFs offer broad diversification at low cost — making them ideal for passive investors.",
      "For core holdings, consider total market index funds. For satellite positions, sector ETFs like **tech**, **clean energy**, or **emerging markets** can add alpha."
    ],
    card: null
  },
  risk: {
    text: [
      "Risk management is the foundation of long-term wealth preservation. The key strategies are **diversification**, **position sizing**, and **stop-loss discipline**.",
      "A common rule: never risk more than **1-2% of total capital** on a single position. Regular rebalancing keeps your risk profile aligned with your goals."
    ],
    card: {
      title: "Risk Levels by Profile",
      items: [["Conservative","20% / 80% bonds"],["Moderate","60% / 40% bonds"],["Aggressive","90% / 10% bonds"],["Speculative","100% equity"]]
    }
  },
  default: {
    text: [
      "The most important principle in investing is **time in the market** over timing the market.",
      "Consistent, disciplined investing — even through volatility — tends to outperform reactive strategies over the long run."
    ],
    card: null
  }
};

const SIDEBAR_TOP = [
  { icon: "↓", label: "save", active: true },
  { icon: "⇄", label: "remux", badge: "β" },
];

const SIDEBAR_BOTTOM = [
  { icon: "⚙", label: "settings" },
  { icon: "♡", label: "donate" },
  { icon: "✦", label: "updates" },
  { icon: "i", label: "about" },
];

const SUGGESTIONS = [
  "how do i diversify my portfolio?",
  "best growth stocks for 2026?",
  "explain etfs vs index funds",
  "how to manage investment risk?",
];

const PLACEHOLDERS = [
  "how can I help you today?",
  "ask me about your portfolio...",
  "what stocks are you watching?",
  "need help managing risk?",
  "curious about ETFs or index funds?",
  "what's your investment goal?",
];

function getTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const WELCOME_MSG = {
  id: "welcome",
  role: "ai",
  time: getTime(),
  paragraphs: [
    "hey — i'm your AI finance advisor. ask me anything about stocks, portfolios, risk, or investing strategy.",
    "paste a link to a financial article, ticker, or just type your question below."
  ],
  card: {
    title: "Today's Market Snapshot",
    items: [["S&P 500","5,621 ▲"],["NASDAQ","19,432 ▲"],["10Y Yield","4.28%"],["VIX","18.4 ▼"]]
  }
};

function getResponse(text) {
  const t = text.toLowerCase();
  if (t.includes("portfolio") || t.includes("diversif") || t.includes("allocat")) return RESPONSES.portfolio;
  if (t.includes("stock") || t.includes("equity") || t.includes("growth")) return RESPONSES.stocks;
  if (t.includes("etf") || t.includes("index") || t.includes("fund")) return RESPONSES.etf;
  if (t.includes("risk") || t.includes("protect") || t.includes("safe")) return RESPONSES.risk;
  return RESPONSES.default;
}

function renderText(str) {
  return str.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function Mascot() {
  return (
    <svg className="mascot" viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg"
      stroke="white" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 44 L22 18 L44 34" strokeWidth="1.8"/>
      <path d="M88 44 L98 18 L76 34" strokeWidth="1.8"/>
      <path d="M33 40 L26 22 L42 33" strokeWidth="1" strokeOpacity="0.5"/>
      <path d="M87 40 L94 22 L78 33" strokeWidth="1" strokeOpacity="0.5"/>
      <ellipse cx="60" cy="62" rx="34" ry="30" strokeWidth="1.8"/>
      <path d="M46 58 Q50 54 54 58" strokeWidth="1.6"/>
      <path d="M66 58 Q70 54 74 58" strokeWidth="1.6"/>
      <path d="M58 67 L60 65 L62 67 L60 69 Z" strokeWidth="1.2" fill="white" fillOpacity="0.8"/>
      <path d="M56 70 Q60 74 64 70" strokeWidth="1.4"/>
      <path d="M26 64 L48 66" strokeWidth="1" strokeOpacity="0.6"/>
      <path d="M24 69 L47 69" strokeWidth="1" strokeOpacity="0.6"/>
      <path d="M72 66 L94 64" strokeWidth="1" strokeOpacity="0.6"/>
      <path d="M73 69 L96 69" strokeWidth="1" strokeOpacity="0.6"/>
      <path d="M36 88 Q28 108 32 118 Q60 126 88 118 Q92 108 84 88" strokeWidth="1.8"/>
      <path d="M32 118 Q24 120 22 115 Q24 110 32 112" strokeWidth="1.4"/>
      <path d="M88 118 Q96 120 98 115 Q96 110 88 112" strokeWidth="1.4"/>
      <path d="M44 100 Q60 106 76 100" strokeWidth="1" strokeOpacity="0.4"/>
      <path d="M55 46 Q60 42 65 46" strokeWidth="1.2" strokeOpacity="0.6"/>
      <path d="M58 44 L60 40 L62 44" strokeWidth="1.2" strokeOpacity="0.6"/>
    </svg>
  );
}

function InfoCard({ card }) {
  return (
    <div className="info-card">
      <div className="info-card-title">{card.title}</div>
      <div className="info-card-grid">
        {card.items.map(([k, v]) => (
          <div className="info-card-item" key={k}>
            <div className="info-card-label">{k}</div>
            <div className="info-card-val">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className="msg-wrap">
      <div className={`msg-row${isUser ? " user" : ""}`}>
        <div className={`msg-avatar${isUser ? " user-av" : " ai"}`}>
          {isUser ? "you" : "AI"}
        </div>
        <div className="msg-content">
          <div className="msg-meta">
            <span className="msg-name">{isUser ? "you" : "financeai"}</span>
            <span className="msg-time">{msg.time}</span>
          </div>
          <div className="msg-bubble">
            {msg.paragraphs.map((p, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: renderText(p) }} />
            ))}
          </div>
          {msg.card && <InfoCard card={msg.card} />}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg-wrap typing-wrap">
      <div className="msg-row">
        <div className="msg-avatar ai">AI</div>
        <div className="msg-content">
          <div className="msg-meta"><span className="msg-name">financeai</span></div>
          <div className="typing-dots">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinanceAI() {
  const [messages, setMessages] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem("sessionId"));
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const messagesEndRef = useRef(null);
  const chatTextareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  async function startChat(text) {
    if (!text.trim() || typing) return;
    const userMsg = { id: Date.now(), role: "user", time: getTime(), paragraphs: [text], card: null };
    if (!chatStarted) {
      setChatStarted(true);
      setMessages([{ ...WELCOME_MSG, time: getTime() }, userMsg]);
    } else {
      setMessages(prev => [...prev, userMsg]);
    }
    setLinkInput("");
    setChatInput("");
    if (chatTextareaRef.current) chatTextareaRef.current.style.height = "auto";
    setTyping(true);

    try {
      // Step 1 — get a session ID if we don't have one yet
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessionRes = await fetch("http://localhost:8000/new-session", {
          method: "POST"
        });
        const sessionData = await sessionRes.json();
        currentSessionId = sessionData.session_id;
        setSessionId(currentSessionId);
        localStorage.setItem("sessionId", currentSessionId);
      }

      // Step 2 — send message to real backend
      const chatRes = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSessionId,
          message: text
        })
      });
      const chatData = await chatRes.json();

      setTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "ai",
        time: getTime(),
        paragraphs: [chatData.reply],
        card: null
      }]);

    } catch (err) {
      setTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "ai",
        time: getTime(),
        paragraphs: ["Sorry, I couldn't connect to the backend. Make sure it's running on port 8000."],
        card: null
      }]);
    }
  }

  function autoResize(e) {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  function resetChat() {
    localStorage.removeItem("sessionId");  // add this line
    setSessionId(null);
    setChatStarted(false);
    setMessages([]);
    setTyping(false);
    setLinkInput("");
    setChatInput("");
}

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="sidebar-expand">{">>"}</button>
          {SIDEBAR_TOP.map(item => (
            <button key={item.label} className={`sidebar-btn${item.active ? " active" : ""}`}>
              {item.badge && <span className="badge">{item.badge}</span>}
              <span className="sb-icon">{item.icon}</span>
              <span className="sb-label">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-divider" />
          {SIDEBAR_BOTTOM.map(item => (
            <button key={item.label} className="sidebar-btn">
              <span className="sb-icon">{item.icon}</span>
              <span className="sb-label">{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div style={{ width: 32 }} />
          <div className="topbar-center">
            <span className="plus">+</span>
            <span>supported services</span>
          </div>
          <button className="topbar-right" onClick={resetChat} title="Reset">↓</button>
        </div>

        <div className="chat-view">
          {!chatStarted ? (
            <div className="home-state">
              <Mascot />
              <div className="home-input-block">
                <div className="link-input-wrap">
                  <span className="link-icon">🔗</span>
                  <input
                    className="link-input"
                    type="text"
                    placeholder={PLACEHOLDERS[placeholderIdx]}
                    value={linkInput}
                    onChange={e => setLinkInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && startChat(linkInput)}
                  />
                </div>
                <div className="suggestions" style={{ padding: 0, marginTop: 8 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} className="sugg-chip" onClick={() => startChat(s)}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="messages-view">
                {messages.map(msg => <Message key={msg.id} msg={msg} />)}
                {typing && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
              <div className="suggestions">
                {SUGGESTIONS.slice(0, 3).map(s => (
                  <button key={s} className="sugg-chip" onClick={() => startChat(s)}>{s}</button>
                ))}
              </div>
              <div className="chat-input-area">
                <div className="chat-input-inner">
                  <textarea ref={chatTextareaRef} className="chat-textarea" rows={1}
                    value={chatInput} placeholder="ask anything about finance..."
                    onChange={e => { setChatInput(e.target.value); autoResize(e); }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); startChat(chatInput); } }}
                  />
                  <button className="chat-send-btn" onClick={() => startChat(chatInput)}>↑</button>
                </div>
                <div className="footer-disclaimer">
                  not financial advice — always consult a licensed advisor
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="global-footer">
        by continuing, you agree to{" "}
        <a href="#" onClick={e => e.preventDefault()}>terms and ethics of use</a>
      </div>
    </div>
  );
}