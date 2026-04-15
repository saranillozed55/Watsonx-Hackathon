import { useState, useEffect } from "react";
import "../styles/PortfolioPanel.css";

const PRESET_TICKERS = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","SPY","QQQ","BTC","ETH","CASH"];

function calcTotal(holdings) {
  return holdings.reduce((s, h) => s + (parseFloat(h.value) || 0), 0);
}

function toPercent(value, total) {
  if (!total) return 0;
  return Math.round((parseFloat(value) / total) * 100);
}

const COLORS = [
  "#c9a84c","#4a9eca","#7ecf78","#e07b5a","#9b7fd4",
  "#5ac8c8","#e0b94a","#d47f9b","#7fabe0","#a0c878",
  "#e09a5a","#8888aa",
];

export default function PortfolioPanel({ onPortfolioChange }) {
  const [holdings, setHoldings] = useState(() => {
    const saved = localStorage.getItem("portfolio");
    return saved ? JSON.parse(saved) : [];
  });
  const [adding,   setAdding]   = useState(false);
  const [ticker,   setTicker]   = useState("");
  const [value,    setValue]    = useState("");
  const [editIdx,  setEditIdx]  = useState(null);
  const [tab,      setTab]      = useState("holdings"); // "holdings" | "add"

  const total = calcTotal(holdings);

  useEffect(() => {
    localStorage.setItem("portfolio", JSON.stringify(holdings));
    onPortfolioChange?.(holdings);
  }, [holdings]);

  function addOrUpdate() {
    const t = ticker.trim().toUpperCase();
    const v = parseFloat(value);
    if (!t || isNaN(v) || v <= 0) return;

    if (editIdx !== null) {
      setHoldings(prev => prev.map((h, i) => i === editIdx ? { ...h, ticker: t, value: v } : h));
      setEditIdx(null);
    } else {
      // merge if ticker exists
      setHoldings(prev => {
        const existing = prev.findIndex(h => h.ticker === t);
        if (existing >= 0) {
          return prev.map((h, i) => i === existing ? { ...h, value: h.value + v } : h);
        }
        return [...prev, { ticker: t, value: v }];
      });
    }
    setTicker(""); setValue(""); setAdding(false); setTab("holdings");
  }

  function remove(idx) {
    setHoldings(prev => prev.filter((_, i) => i !== idx));
  }

  function startEdit(idx) {
    setTicker(holdings[idx].ticker);
    setValue(String(holdings[idx].value));
    setEditIdx(idx);
    setTab("add");
  }

  function cancelAdd() {
    setTicker(""); setValue(""); setEditIdx(null); setTab("holdings");
  }

  // Donut chart via SVG
  function DonutChart() {
    if (!holdings.length || !total) return null;
    const R = 36, CX = 44, CY = 44, stroke = 14;
    const circ = 2 * Math.PI * R;
    let offset = 0;
    const slices = holdings.map((h, i) => {
      const pct = parseFloat(h.value) / total;
      const dash = pct * circ;
      const slice = { pct, dash, offset, color: COLORS[i % COLORS.length] };
      offset += dash;
      return slice;
    });

    return (
      <svg width="88" height="88" viewBox="0 0 88 88" className="pp-donut">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {slices.map((s, i) => (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={circ / 4 - s.offset}
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        ))}
        <text x={CX} y={CY - 4} textAnchor="middle" className="donut-label-top">
          ${total >= 1000000
            ? (total / 1000000).toFixed(1) + "M"
            : total >= 1000
            ? (total / 1000).toFixed(0) + "K"
            : total.toFixed(0)}
        </text>
        <text x={CX} y={CY + 11} textAnchor="middle" className="donut-label-sub">total</text>
      </svg>
    );
  }

  return (
    <div className="pp-wrap">
      <div className="pp-header">
        <span className="pp-title">Portfolio</span>
        {tab === "holdings" && (
          <button className="pp-add-btn" onClick={() => setTab("add")}>+ Add</button>
        )}
      </div>

      {holdings.length > 0 && tab === "holdings" && (
        <div className="pp-donut-row">
          <DonutChart />
          <div className="pp-legend">
            {holdings.slice(0, 4).map((h, i) => (
              <div key={i} className="pp-legend-item">
                <span className="pp-legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="pp-legend-ticker">{h.ticker}</span>
                <span className="pp-legend-pct">{toPercent(h.value, total)}%</span>
              </div>
            ))}
            {holdings.length > 4 && (
              <div className="pp-legend-item" style={{ opacity: 0.5 }}>
                +{holdings.length - 4} more
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "holdings" && (
        <>
          {holdings.length === 0 ? (
            <div className="pp-empty">
              <div className="pp-empty-icon">📊</div>
              <div className="pp-empty-text">No holdings yet</div>
              <div className="pp-empty-sub">Add positions so Smiley can analyze your portfolio</div>
              <button className="pp-start-btn" onClick={() => setTab("add")}>Add your first holding</button>
            </div>
          ) : (
            <div className="pp-list">
              {holdings.map((h, i) => (
                <div key={i} className="pp-item">
                  <div className="pp-item-left">
                    <div className="pp-color-bar" style={{ background: COLORS[i % COLORS.length] }} />
                    <div>
                      <div className="pp-ticker">{h.ticker}</div>
                      <div className="pp-pct">{toPercent(h.value, total)}% of portfolio</div>
                    </div>
                  </div>
                  <div className="pp-item-right">
                    <div className="pp-value">${Number(h.value).toLocaleString()}</div>
                    <div className="pp-actions">
                      <button className="pp-edit" onClick={() => startEdit(i)}>✎</button>
                      <button className="pp-del"  onClick={() => remove(i)}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {holdings.length > 0 && (
            <button
              className="pp-analyze-btn"
              onClick={() => {
                const summary = holdings
                  .map(h => `${h.ticker} (${toPercent(h.value, total)}%)`)
                  .join(", ");
                // bubble up to parent to send as chat message
                onPortfolioChange?.(holdings, `Analyze my portfolio: ${summary}. Total value: $${total.toLocaleString()}. Identify any overexposure, concentration risk, or rebalancing opportunities.`);
              }}
            >
              Analyze with AI →
            </button>
          )}
        </>
      )}

      {tab === "add" && (
        <div className="pp-add-form">
          <div className="pp-form-label">{editIdx !== null ? "Edit holding" : "Add holding"}</div>

          <div className="pp-ticker-grid">
            {PRESET_TICKERS.map(t => (
              <button
                key={t}
                className={`pp-preset${ticker === t ? " sel" : ""}`}
                onClick={() => setTicker(t)}
              >{t}</button>
            ))}
          </div>

          <input
            className="pp-input"
            placeholder="Ticker (e.g. AAPL)"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && value && addOrUpdate()}
          />
          <input
            className="pp-input"
            placeholder="Value in USD (e.g. 25000)"
            type="number"
            min="0"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addOrUpdate()}
          />

          <div className="pp-form-actions">
            <button className="pp-cancel" onClick={cancelAdd}>Cancel</button>
            <button
              className="pp-save"
              disabled={!ticker.trim() || !value || parseFloat(value) <= 0}
              onClick={addOrUpdate}
            >
              {editIdx !== null ? "Save changes" : "Add holding"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}