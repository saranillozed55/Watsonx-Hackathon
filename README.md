# 😊 Smiley Financial Advisor

> **Personalized, AI-powered financial advisory — built for everyday investors.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20App-blue?style=for-the-badge)](https://watsonx-hackathon-git-main-carden-dangs-projects.vercel.app/)
[![IBM WatsonX](https://img.shields.io/badge/IBM-WatsonX%20Orchestrate-054ADA?style=for-the-badge&logo=ibm)](https://www.ibm.com/watsonx)
[![Built with React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)

---

## 📖 Overview

Smiley is a multi-agent financial advisory application built for the **IBM WatsonX Hackathon**. It puts institutional-grade investment tools in the hands of everyday investors through a conversational AI interface backed by real-time market data.

Whether you're a first-time investor or a seasoned trader looking to move fast, Smiley analyzes your portfolio, checks macroeconomic conditions, evaluates risk, and delivers personalized, actionable recommendations — all in one place.

---

## ✨ Features

- 🤖 **Seven-agent AI system** powered by IBM WatsonX Orchestrate
- 📈 **Real-time market data** via Finnhub API (live quotes, news, analyst ratings)
- 🛡️ **Risk-aware recommendations** tailored to your risk tolerance and goals
- 💼 **Portfolio analysis** with sector concentration and rebalancing insights
- 🌍 **Macroeconomic context** integrated into every recommendation
- 🧾 **Tax optimization** strategies to maximize after-tax returns
- 🧭 **Onboarding flow** that personalizes every interaction from the start

---

## 🏗️ Architecture

### Seven-Agent WatsonX Orchestrate System

```
User Query
    │
    ▼
┌─────────────────────┐
│  Orchestrator Agent │  ← Routes requests to the right specialist
└─────────┬───────────┘
          │
    ┌─────┴──────────────────────────────────────────┐
    │                                                │
    ▼                                                ▼
┌──────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│ Market Research  │   │ Risk Compliance  │   │  Portfolio Agent    │
│ Agent            │   │ Agent            │   │                     │
│ (Finnhub API)    │   │ (Suitability)    │   │ (Holdings Analysis) │
└──────────────────┘   └──────────────────┘   └─────────────────────┘
    │
    ▼
┌──────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│ Recommendation   │   │ Macroeconomic    │   │  Tax Agent          │
│ Agent            │   │ Agent            │   │                     │
│ (Synthesizer)    │   │ (Global Context) │   │ (After-tax Returns) │
└──────────────────┘   └──────────────────┘   └─────────────────────┘
```

| Agent | Responsibility |
|---|---|
| **Orchestrator** | Routes incoming requests to the appropriate specialist agent |
| **Market Research** | Live quotes, 52-week ranges, volume, news, sector peer comparisons |
| **Risk Compliance** | Validates recommendations against user's risk profile and goals |
| **Portfolio** | Sector concentration, diversification gaps, rebalancing opportunities |
| **Recommendation** | Synthesizes all agent outputs into a clear, actionable recommendation |
| **Macroeconomic** | Analyzes global and domestic conditions affecting investments |
| **Tax** | Identifies tax-efficient strategies to maximize after-tax returns |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React |
| **Backend** | Python / FastAPI |
| **AI Agents** | IBM WatsonX Orchestrate (Dallas region) |
| **Market Data** | Finnhub REST API |
| **Frontend Hosting** | Vercel (CI/CD via GitHub) |
| **Backend Hosting** | Railway |

---

## 🚀 Deployment

### Frontend — Vercel
The React frontend is deployed on Vercel with automatic CI/CD. Every push to `main` triggers a new production deployment.

**Live URL:** [https://watsonx-hackathon-git-main-carden-dangs-projects.vercel.app/](https://watsonx-hackathon-git-main-carden-dangs-projects.vercel.app/)

### Backend — Railway
The FastAPI backend is hosted on Railway with managed HTTPS, environment variable secrets, and zero-downtime deploys.

Environment variables required on Railway:
```
IBM_IAM_API_KEY=
WATSONX_ORCHESTRATE_URL=
FINNHUB_API_KEY=
```

---

## 🧑‍💻 Local Development

### Prerequisites
- Node.js 18+
- Python 3.10+
- IBM WatsonX Orchestrate API credentials
- Finnhub API key

### 1. Clone the repo
```bash
git clone https://github.com/your-org/watsonx-hackathon.git
cd watsonx-hackathon
```

### 2. Backend setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `/backend`:
```env
IBM_IAM_API_KEY=your_key_here
WATSONX_ORCHESTRATE_URL=your_url_here
FINNHUB_API_KEY=your_key_here
```

Start the backend:
```bash
uvicorn main:app --reload
```

### 3. Frontend setup
```bash
cd frontend
npm install
npm run dev
```

The app will be running at `http://localhost:5173`.

---

## 📂 Project Structure

```
watsonx-hackathon/
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages (Chat, Analysis, Onboarding)
│   │   └── ...
│   └── package.json
├── backend/                # FastAPI application
│   ├── main.py             # Entry point
│   ├── agents/             # WatsonX agent integration logic
│   ├── routes/             # API route handlers
│   ├── services/           # Finnhub & IBM IAM clients
│   └── requirements.txt
└── README.md
```

---

## 💡 Impact

Smiley bridges the gap between novice investors and institutional-grade tools previously available only to the wealthy. By combining IBM WatsonX Orchestrate's multi-agent framework with real-time market intelligence, Smiley delivers:

- **Accessibility** — personalized financial advice without a financial advisor
- **Speed** — decisive investment insights in seconds, not hours
- **Confidence** — risk-checked, tax-aware, macro-informed recommendations

---

## 👥 Team

Built with ❤️ for the IBM WatsonX Hackathon.

---

## 📄 License

This project was built for hackathon purposes. See [LICENSE](LICENSE) for details.
