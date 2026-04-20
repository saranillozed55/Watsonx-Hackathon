import { useState, useEffect, useRef } from "react";
import { marked } from "marked";
import "../styles/InvestmentAnalysis.css";
import API from "../config";

// ── Sector map ────────────────────────────────────────────────────────────────
const SECTOR_MAP = {
  NVDA:"Technology", AAPL:"Technology", MSFT:"Technology", GOOGL:"Technology",
  GOOG:"Technology", META:"Technology", AMZN:"Technology", TSLA:"Technology",
  AMD:"Technology",  INTC:"Technology", ORCL:"Technology", CRM:"Technology",
  ADBE:"Technology", QCOM:"Technology", AVGO:"Technology", NOW:"Technology",
  NFLX:"Technology", UBER:"Technology", LYFT:"Technology", SNAP:"Technology",
  JPM:"Financials",  BAC:"Financials",  GS:"Financials",   MS:"Financials",
  WFC:"Financials",  C:"Financials",    BLK:"Financials",  AXP:"Financials",
  JNJ:"Healthcare",  UNH:"Healthcare",  PFE:"Healthcare",  MRK:"Healthcare",
  ABBV:"Healthcare", LLY:"Healthcare",  TMO:"Healthcare",  ABT:"Healthcare",
  XOM:"Energy",      CVX:"Energy",      COP:"Energy",      SLB:"Energy",
  WMT:"Consumer",    HD:"Consumer",     MCD:"Consumer",    NKE:"Consumer",
  SBUX:"Consumer",   TGT:"Consumer",    COST:"Consumer",
  SPY:"Index ETF",   QQQ:"Index ETF",   DIA:"Index ETF",   IWM:"Index ETF",
  VTI:"Index ETF",   VOO:"Index ETF",
  IBIT:"Crypto",     FBTC:"Crypto",
  GLD:"Commodities", SLV:"Commodities",
  TLT:"Bonds",       AGG:"Bonds",       BND:"Bonds",
  CASH:"Cash",
};

const SECTOR_COLORS = {
  Technology:  "#4a9eca",
  Financials:  "#c9a84c",
  Healthcare:  "#7ecf78",
  Energy:      "#e07b5a",
  Consumer:    "#9b7fd4",
  "Index ETF": "#5ac8c8",
  Crypto:      "#f7931a",
  Commodities: "#e0b94a",
  Bonds:       "#8888aa",
  Cash:        "#555",
  Other:       "#666",
};

function getSector(ticker) {
  return SECTOR_MAP[ticker?.toUpperCase()] || "Other";
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Sparkline canvas ──────────────────────────────────────────────────────────
function Sparkline({ data, up }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !data?.length) return;
    const el = ref.current;
    const W = el.offsetWidth || 80, H = 32;
    el.width = W; el.height = H;
    const ctx = el.getContext("2d");
    const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
    const xOf = i => i / (data.length - 1) * W;
    const yOf = v => H - 4 - (v - mn) / rng * (H - 8);
    const color = up ? "#4ade80" : "#f87171";
    ctx.beginPath();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    data.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
    ctx.stroke();
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = up ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)";
    ctx.fill();
  }, [data, up]);
  return <canvas ref={ref} className="ia-spark" />;
}

// ── Allocation bar ────────────────────────────────────────────────────────────
function AllocationBar({ holdings }) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const bySector = {};
  holdings.forEach(h => {
    const s = getSector(h.ticker);
    bySector[s] = (bySector[s] || 0) + h.value;
  });
  const sectors = Object.entries(bySector).sort((a, b) => b[1] - a[1]);
  return (
    <div className="ia-alloc-wrap">
      <div className="ia-alloc-bar">
        {sectors.map(([s, v]) => (
          <div key={s} className="ia-alloc-seg"
            style={{ width: `${v / total * 100}%`, background: SECTOR_COLORS[s] || "#555" }}
            title={`${s}: ${Math.round(v / total * 100)}%`}
          />
        ))}
      </div>
      <div className="ia-alloc-legend">
        {sectors.map(([s, v]) => (
          <div key={s} className="ia-legend-item">
            <span className="ia-legend-dot" style={{ background: SECTOR_COLORS[s] || "#555" }} />
            <span className="ia-legend-name">{s}</span>
            <span className="ia-legend-pct">{Math.round(v / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Holding row ───────────────────────────────────────────────────────────────
function HoldingRow({ holding, stockData, selected, onClick }) {
  const sector = getSector(holding.ticker);
  const color  = SECTOR_COLORS[sector] || "#555";
  const up     = stockData ? stockData.change_pct >= 0 : true;
  return (
    <div className={`ia-holding-row${selected ? " sel" : ""}`} onClick={onClick}>
      <div className="ia-holding-left">
        <div className="ia-sector-bar" style={{ background: color }} />
        <div>
          <div className="ia-holding-ticker">{holding.ticker}</div>
          <div className="ia-holding-sector">{sector}</div>
        </div>
      </div>
      <div className="ia-holding-mid">
        {stockData
          ? <Sparkline data={stockData.sparkline} up={up} />
          : <div className="ia-spark-skel" />}
      </div>
      <div className="ia-holding-right">
        <div className="ia-holding-price">{stockData ? `$${stockData.price}` : "—"}</div>
        <div className={`ia-holding-chg ${up ? "up" : "dn"}`}>
          {stockData ? `${up ? "+" : ""}${stockData.change_pct}%` : "—"}
        </div>
      </div>
    </div>
  );
}

// ── Analyst recommendation bar ────────────────────────────────────────────────
function RecommendationBar({ rec }) {
  if (!rec) return null;
  const { strongBuy, buy, hold, sell, strongSell, period } = rec;
  const total     = strongBuy + buy + hold + sell + strongSell || 1;
  const buyCount  = strongBuy + buy;
  const sellCount = sell + strongSell;
  const consensus = buyCount > hold && buyCount > sellCount ? "BUY"
                  : hold >= buyCount && hold >= sellCount   ? "HOLD"
                  : "SELL";
  const consColor = { BUY: "#4ade80", HOLD: "#c9a84c", SELL: "#f87171" }[consensus];
  const bars = [
    { label: "Strong Buy",  val: strongBuy,  color: "#4ade80" },
    { label: "Buy",         val: buy,        color: "#86efac" },
    { label: "Hold",        val: hold,       color: "#c9a84c" },
    { label: "Sell",        val: sell,       color: "#f87171" },
    { label: "Strong Sell", val: strongSell, color: "#dc2626" },
  ];
  return (
    <div className="ia-rec">
      <div className="ia-rec-header">
        <span className="ia-rec-label">Analyst Consensus</span>
        <div className="ia-rec-right">
          <span className="ia-rec-consensus" style={{ color: consColor }}>{consensus}</span>
          <span className="ia-rec-total">{total} analysts · {period}</span>
        </div>
      </div>
      <div className="ia-rec-bar">
        {bars.map(b => (
          <div key={b.label} className="ia-rec-seg"
            style={{ flex: b.val || 0.1, background: b.color }}
            title={`${b.label}: ${b.val}`}
          />
        ))}
      </div>
      <div className="ia-rec-counts">
        {bars.map(b => (
          <div key={b.label} className="ia-rec-count">
            <span style={{ color: b.color }}>{b.val}</span>
            <span className="ia-rec-count-label">{b.label.replace("Strong ", "S.")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────
function StatsStrip({ stockData }) {
  if (!stockData) return null;
  const stats = [
    ["Open",       `$${stockData.open}`],
    ["Prev Close", `$${stockData.prevClose}`],
    ["52W Low",    `$${stockData.low52}`],
    ["52W High",   `$${stockData.high52}`],
    ["Volume",     stockData.volume],
  ];
  return (
    <div className="ia-stats-strip">
      {stats.map(([k, v]) => (
        <div key={k} className="ia-stat">
          <span className="ia-stat-k">{k}</span>
          <span className="ia-stat-v">{v || "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ── AI Analysis — routed through WatsonX agents ───────────────────────────────
function AIAnalysis({ ticker, sector, stockData, recData, profile }) {
  const [text,    setText]    = useState("");
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ticker || fetched === ticker) return;
    setLoading(true);
    setText("");

    const profileStr = profile
      ? `Investor profile: risk tolerance = ${profile.risk}, goal = ${profile.goal}, horizon = ${profile.horizon}.`
      : "";

    const priceStr = stockData
      ? `Live data: price $${stockData.price}, change ${stockData.change_pct}% today, ` +
        `52w range $${stockData.low52}–$${stockData.high52}, volume ${stockData.volume}, ` +
        `open $${stockData.open}, prev close $${stockData.prevClose}.`
      : "";

    const recStr = recData
      ? `Analyst ratings: ${recData.strongBuy + recData.buy} buy, ${recData.hold} hold, ` +
        `${recData.sell + recData.strongSell} sell (${recData.period}).`
      : "";

    const prompt = `${profileStr}
${priceStr}
${recStr}

You are a senior Wall Street analyst. Write a structured investment analysis of ${ticker} (${sector} sector).

## ${ticker} — Investment Analysis

**1. Company Overview**
What ${ticker} does and its competitive position in the ${sector} sector.

**2. Recent Performance**
Analysis of today's price action and recent trends based on the data above.

**3. Sector Outlook**
Current state of the ${sector} sector — key tailwinds and headwinds.

**4. Key Risks**
Top 3 risks specific to holding ${ticker} right now.

**5. Recommendation**
Given the investor profile above, a clear Buy / Hold / Reduce recommendation with reasoning. Reference the analyst consensus.

**6. Key Metrics to Watch**
2–3 specific data points or upcoming events that could move this stock.

Be concise, specific, and data-driven. No generic disclaimers.`;

    async function runAnalysis() {
      let sessionId = localStorage.getItem("sessionId");
      if (!sessionId) {
        try {
          const r = await fetch(`${API}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              message:    prompt,
              profile:    storedProfile  ? JSON.parse(storedProfile)  : null,
              holdings:   storedHoldings ? JSON.parse(storedHoldings) : null,
          }),
        });
          const d = await r.json();
          console.log("Analysis response:", d);  // ← add this to debug
          if (d?.reply) {
            setText(d.reply);
            setError(false);
          } else {
            setText("");
            setError(true);
          }
        } catch (err) {
          console.error("Analysis error:", err);
          setError(true);
        }
      }

      const storedProfile  = localStorage.getItem("userProfile");
      const storedHoldings = localStorage.getItem("portfolio");

      try {
        const r = await fetch(`${API}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            message:    prompt,
            profile:    storedProfile  ? JSON.parse(storedProfile)  : null,
            holdings:   storedHoldings ? JSON.parse(storedHoldings) : null,
          }),
        });
        const d = await r.json();
        setText(d?.reply || "Analysis unavailable.");
      } catch {
        setText("Failed to load analysis.");
      }

      setFetched(ticker);
      setLoading(false);
    }

    runAnalysis();
  }, [ticker]);

  return (
    <div className="ia-analysis-body">
      {loading ? (
        <div className="ia-loading">
          {[100, 72, 88, 55, 92, 68].map((w, i) => (
            <div key={i} className="ia-loading-bar"
              style={{ width: `${w}%`, animationDelay: `${i * 0.12}s` }} />
          ))}
          <div className="ia-loading-label">Analyzing {ticker} via WatsonX…</div>
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0.5rem 0" }}>
          <div className="ia-muted">Analysis failed to load.</div>
          <button
            onClick={() => { setFetched(null); setError(false); }}
            style={{
              fontSize: "11px", color: "#c9a84c",
              background: "rgba(201,168,76,0.1)",
              border: "0.5px solid rgba(201,168,76,0.3)",
              borderRadius: "6px", padding: "5px 12px",
              cursor: "pointer", width: "fit-content"
            }}
          >
            Retry →
          </button>
        </div>
      ) : text ? (
        <div className="ia-md"
          dangerouslySetInnerHTML={{ __html: marked.parse(text) }} />
      ) : null}
    </div>
  );
}

// ── News panel ────────────────────────────────────────────────────────────────
function NewsPanel({ ticker }) {
  const [articles, setArticles] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [fetched,  setFetched]  = useState(null);

  useEffect(() => {
    if (!ticker || fetched === ticker) return;
    setLoading(true);
    setArticles([]);
    fetch(`${API}/api/stock/${ticker}/news`)
      .then(r => r.json())
      .then(d => { setArticles(d.articles || []); setFetched(ticker); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ticker]);

  if (!ticker) return null;

  return (
    <div className="ia-card">
      <div className="ia-card-label">Recent News — {ticker}</div>
      {loading ? (
        <div className="ia-muted">Loading news…</div>
      ) : articles.length ? (
        <div className="ia-news-list">
          {articles.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="ia-news-item">
              <div className="ia-news-top">
                <span className="ia-news-headline">{a.headline}</span>
                <span className="ia-news-time">{timeAgo(a.datetime)}</span>
              </div>
              {a.summary && (
                <div className="ia-news-summary">
                  {a.summary.slice(0, 140)}{a.summary.length > 140 ? "…" : ""}
                </div>
              )}
              <div className="ia-news-source">{a.source}</div>
            </a>
          ))}
        </div>
      ) : (
        <div className="ia-muted">No recent news found.</div>
      )}
    </div>
  );
}

// ── Peers panel ───────────────────────────────────────────────────────────────
function PeersPanel({ ticker }) {
  const [peers,   setPeers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(null);

  useEffect(() => {
    if (!ticker || fetched === ticker) return;
    setLoading(true);
    setPeers([]);
    fetch(`${API}/api/stock/${ticker}/peers`)
      .then(r => r.json())
      .then(d => { setPeers(d.peers || []); setFetched(ticker); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ticker]);

  if (!ticker || (!loading && !peers.length)) return null;

  return (
    <div className="ia-card">
      <div className="ia-card-label">Sector Peers</div>
      {loading ? (
        <div className="ia-muted">Loading peers…</div>
      ) : (
        <div className="ia-peers-grid">
          {peers.map((p, i) => {
            const sec   = getSector(p);
            const color = SECTOR_COLORS[sec] || "#555";
            return (
              <div key={i} className="ia-peer-chip">
                <span className="ia-peer-ticker" style={{ color }}>{p}</span>
                <span className="ia-peer-sector">{sec}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvestmentAnalysis() {
  const [holdings,  setHoldings]  = useState([]);
  const [stockData, setStockData] = useState({});
  const [recData,   setRecData]   = useState({});
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [profile,   setProfile]   = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("portfolio");
    const prof  = localStorage.getItem("userProfile");
    if (saved) {
      const h = JSON.parse(saved).filter(h => h.ticker !== "CASH");
      setHoldings(h);
      if (h.length) setSelected(h[0].ticker);
    }
    if (prof) setProfile(JSON.parse(prof));
  }, []);

  useEffect(() => {
    if (!holdings.length) return;
    setLoading(true);
    Promise.all(
      holdings.map(h =>
        fetch(`${API}/api/stock/${h.ticker}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(d => [h.ticker, d])
      )
    ).then(results => {
      const map = {};
      results.forEach(([t, d]) => { if (d) map[t] = d; });
      setStockData(map);
      setLoading(false);
    });
  }, [holdings]);

  useEffect(() => {
    if (!selected || recData[selected] !== undefined) return;
    fetch(`${API}/api/stock/${selected}/recommendation`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setRecData(prev => ({ ...prev, [selected]: d?.recommendation || null }));
      })
      .catch(() => {});
  }, [selected]);

  const total     = holdings.reduce((s, h) => s + h.value, 0);
  const selData   = stockData[selected] || null;
  const selRec    = recData[selected]   || null;
  const selSector = selected ? getSector(selected) : null;
  const selColor  = selSector ? (SECTOR_COLORS[selSector] || "#555") : "#555";

  if (!holdings.length) {
    return (
      <div className="ia-empty-page">
        <div className="ia-empty-icon">📊</div>
        <h2>No holdings to analyze</h2>
        <p>Add stocks to your portfolio in the sidebar, then come back here for a full sector analysis.</p>
      </div>
    );
  }

  return (
    <div className="ia-page">
      <div className="ia-page-header">
        <div>
          <div className="ia-page-title">Investment Analysis</div>
          <div className="ia-page-sub">
            {holdings.length} holding{holdings.length !== 1 ? "s" : ""}
            {" · "}${total.toLocaleString()} total
            {profile && ` · ${profile.risk} risk · ${profile.goal}`}
          </div>
        </div>
        <div className="ia-live-indicator">
          {loading
            ? <><span className="ia-live-dot loading" />Fetching data…</>
            : Object.keys(stockData).length > 0
              ? <><span className="ia-live-dot" />Live · Finnhub</>
              : null}
        </div>
      </div>

      <div className="ia-card" style={{ marginBottom: "1rem" }}>
        <div className="ia-card-label">Sector Allocation</div>
        <AllocationBar holdings={holdings} />
      </div>

      <div className="ia-grid">
        <div className="ia-left">
          <div className="ia-card-label" style={{ marginBottom: "8px" }}>Holdings</div>
          {holdings.map(h => (
            <HoldingRow
              key={h.ticker}
              holding={h}
              stockData={stockData[h.ticker] || null}
              selected={selected === h.ticker}
              onClick={() => setSelected(h.ticker)}
            />
          ))}
        </div>

        <div className="ia-right">
          {selected ? (
            <>
              <div className="ia-card ia-detail-header">
                <div className="ia-detail-title-row">
                  <div>
                    <span className="ia-detail-ticker">{selected}</span>
                    <span className="ia-detail-sector" style={{ color: selColor }}>
                      {selSector}
                    </span>
                  </div>
                  {selData && (
                    <div className="ia-detail-price-block">
                      <span className="ia-detail-price">${selData.price}</span>
                      <span className={`ia-detail-chg ${selData.change_pct >= 0 ? "up" : "dn"}`}>
                        {selData.change_pct >= 0 ? "+" : ""}{selData.change_pct}%
                      </span>
                    </div>
                  )}
                </div>
                <StatsStrip stockData={selData} />
                <RecommendationBar rec={selRec} />
                <AIAnalysis
                  ticker={selected}
                  sector={selSector}
                  stockData={selData}
                  recData={selRec}
                  profile={profile}
                />
              </div>

              <PeersPanel ticker={selected} />
              <NewsPanel  ticker={selected} />
            </>
          ) : (
            <div className="ia-select-prompt">
              ← Select a holding to view analysis
            </div>
          )}
        </div>
      </div>
    </div>
  );
}