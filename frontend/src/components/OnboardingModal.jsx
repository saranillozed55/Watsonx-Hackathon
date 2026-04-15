import { useState } from "react";
import "../styles/OnboardingModal.css";

const STEPS = [
  {
    key: "risk",
    label: "Step 1 of 4",
    title: "What's your risk tolerance?",
    sub: "This helps us calibrate every recommendation to your comfort level.",
    type: "opts",
    opts: [
      { val: "low",      icon: "🛡", label: "Conservative", desc: "Protect my capital" },
      { val: "moderate", icon: "⚖", label: "Moderate",      desc: "Balance growth & safety" },
      { val: "high",     icon: "🚀", label: "Aggressive",    desc: "Maximize returns" },
    ],
  },
  {
    key: "goal",
    label: "Step 2 of 4",
    title: "What's your main investment goal?",
    sub: "We'll tailor strategies around what matters most to you.",
    type: "opts",
    opts: [
      { val: "growth",       icon: "📈", label: "Growth",       desc: "Grow my wealth" },
      { val: "income",       icon: "💵", label: "Income",        desc: "Regular cash flow" },
      { val: "preservation", icon: "🏦", label: "Preservation", desc: "Keep what I have" },
    ],
  },
  {
    key: "horizon",
    label: "Step 3 of 4",
    title: "What's your time horizon?",
    sub: "How long do you plan to keep your money invested?",
    type: "opts",
    cols: 2,
    opts: [
      { val: "< 1 year",   icon: "⚡", label: "Short-term",  desc: "Under 1 year" },
      { val: "1–5 years",  icon: "📅", label: "Medium-term", desc: "1 – 5 years" },
      { val: "5–10 years", icon: "🌿", label: "Long-term",   desc: "5 – 10 years" },
      { val: "10+ years",  icon: "🌳", label: "Very long",   desc: "10+ years" },
    ],
  },
  {
    key: "portfolio",
    label: "Step 4 of 4",
    title: "Portfolio size",
    sub: "Optional — helps us suggest suitable instruments.",
    type: "text",
    placeholder: "e.g. $50,000",
    optional: true,
  },
];

function buildProfile(answers) {
  return {
    risk:      answers.risk      || null,
    goal:      answers.goal      || null,
    horizon:   answers.horizon   || null,
    portfolio: answers.portfolio || null,
  };
}

export default function OnboardingModal({ onComplete }) {
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState({});
  const [done,    setDone]    = useState(false);
  const [textVal, setTextVal] = useState("");

  const s   = STEPS[step];
  const sel = answers[s.key];
  const pct = ((step + 1) / STEPS.length) * 100;

  function pick(val) {
    setAnswers(prev => ({ ...prev, [s.key]: val }));
  }

  function next() {
    if (step < STEPS.length - 1) { setStep(step + 1); setTextVal(""); }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function finish(skipText = false) {
    const updated = { ...answers };
    if (!skipText && textVal.trim()) updated.portfolio = textVal.trim();
    const profile = buildProfile(updated);
    localStorage.setItem("userProfile", JSON.stringify(profile));
    setDone(true);
    setTimeout(() => onComplete(profile), 900);
  }

  if (done) {
    return (
      <div className="ob-overlay">
        <div className="ob-modal ob-done">
          <div className="ob-check">✓</div>
          <h2>You're all set</h2>
          <p className="ob-done-sub">
            {answers.risk} risk · {answers.goal} · {answers.horizon}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-overlay">
      <div className="ob-modal">
        {/* dots */}
        <div className="ob-dots">
          {STEPS.map((_, i) => (
            <div key={i} className={`ob-dot${i === step ? " active" : ""}`} />
          ))}
        </div>

        {/* progress bar */}
        <div className="ob-bar">
          <div className="ob-bar-fill" style={{ width: pct + "%" }} />
        </div>

        <div className="ob-step-label">{s.label}</div>
        <h2 className="ob-title">{s.title}</h2>
        <p className="ob-sub">{s.sub}</p>

        {s.type === "opts" ? (
          <>
            <div
              className="ob-opts"
              style={{ gridTemplateColumns: `repeat(${s.cols || 3}, 1fr)` }}
            >
              {s.opts.map(o => (
                <button
                  key={o.val}
                  className={`ob-opt${sel === o.val ? " sel" : ""}`}
                  onClick={() => pick(o.val)}
                >
                  <span className="ob-opt-icon">{o.icon}</span>
                  <span className="ob-opt-label">{o.label}</span>
                  <span className="ob-opt-desc">{o.desc}</span>
                </button>
              ))}
            </div>

            <div className="ob-actions">
              <button
                className="ob-back"
                onClick={back}
                style={{ visibility: step === 0 ? "hidden" : "visible" }}
              >
                ← Back
              </button>
              <button className="ob-next" disabled={!sel} onClick={next}>
                Continue →
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              type="text"
              className="ob-text"
              placeholder={s.placeholder}
              value={textVal}
              onChange={e => setTextVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && finish(false)}
              autoFocus
            />
            <div className="ob-actions">
              <button className="ob-back" onClick={back}>← Back</button>
              <div className="ob-actions-right">
                {s.optional && (
                  <button className="ob-skip" onClick={() => finish(true)}>
                    Skip
                  </button>
                )}
                <button className="ob-next" onClick={() => finish(false)}>
                  Get started →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}