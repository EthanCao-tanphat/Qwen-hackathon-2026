# Healix ⚕️

**AI-powered health platform — because health data should heal, not confuse.**

Built with Qwen AI models for the Elfie Healthcare Track · Qwen AI Build Day Vietnam 2026.

---

## What is Healix?

Healix is a multilingual health platform with three AI-powered tools:

- **Labs Analyzer** — Upload any lab report PDF. Vision AI (Qwen-VL) extracts every test result, classifies severity across 5 tiers, and generates plain-language explanations with next steps.
- **Clinical Scribe** — Upload a consultation recording. Audio AI (Qwen-Audio) transcribes it, identifies symptoms and medications, then generates a structured SOAP note — saving doctors 10–15 hours weekly.
- **Body Scan** — Upload front/side body photos with your height. AI estimates 8 circumference measurements and calculates body fat percentage using the U.S. Navy Method.

Supports **4 languages**: English, French, Arabic, Vietnamese.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, React Router, Lucide Icons |
| Backend | FastAPI, Uvicorn, Python 3.11+ |
| AI Models | Qwen-VL, Qwen-Audio, Qwen-Max (via Dashscope API) |
| PDF Parsing | PyMuPDF |
| Translation | deep-translator (Google Translate) |
| Deployment | Docker Compose |

---

## Project Structure

```
healix-project/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── routes/
│   │   │   ├── labs.py             # Labs Analyzer endpoint
│   │   │   ├── scribe.py           # Clinical Scribe endpoint
│   │   │   └── bodyscan.py         # Body Scan endpoint
│   │   └── shared/
│   │       ├── qwen_client.py      # Qwen API wrapper
│   │       └── multilingual.py     # Language detection + translation
│   ├── .env                        # ⚠️ YOUR API KEY (never commit!)
│   ├── .env.example                # Template for teammates
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Router
│   │   ├── main.jsx                # Entry point
│   │   ├── lib/api.js              # API calls
│   │   ├── components/ui/          # Shared components
│   │   └── pages/
│   │       ├── Landing.jsx
│   │       ├── Labs.jsx
│   │       ├── Scribe.jsx
│   │       └── BodyScan.jsx
│   ├── package.json
│   └── vite.config.js              # Proxy /api → :8000
├── docker-compose.yml
├── .gitignore
├── HEALIX.md
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Dashscope API key](https://dashscope.console.aliyun.com/) (for Qwen models)

### 1. Clone the repo

```bash
git clone https://github.com/EthanCao-tanphat/Qwen-hackathon-2026.git
cd Qwen-hackathon-2026
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create your `.env` file:

```bash
cp .env.example .env
```

Then open `.env` and paste your real Dashscope API key:

```
DASHSCOPE_API_KEY=your_real_key_here
```

> ⚠️ **NEVER commit the `.env` file.** It is already in `.gitignore`. Only `.env.example` should be pushed.

Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` requests to the backend at `:8000`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/labs/analyze` | Upload lab report PDF → get analyzed results |
| POST | `/api/scribe/transcribe` | Upload audio file → get SOAP note |
| POST | `/api/bodyscan/measure` | Upload body photos + height → get measurements |

All endpoints accept a `language` parameter: `en`, `fr`, `ar`, `vi`, or `auto`.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DASHSCOPE_API_KEY` | Your Alibaba Cloud Dashscope API key for Qwen models |

---

## Contributing

1. Clone the repo and set up your local environment (see above)
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and test locally
4. Commit: `git commit -m "feat: your feature description"`
5. Push: `git push origin feature/your-feature`
6. Open a Pull Request

### Important rules

- **NEVER commit `.env` or API keys** — always check `git status` before pushing
- Keep `requirements.txt` and `package.json` updated if you add new dependencies
- Test both backend and frontend before pushing

---

## Running with Docker

```bash
docker-compose up --build
```

This starts both frontend and backend. Make sure your `.env` file exists in `backend/` before running.

---

## Team

Built by 4 builders for Qwen AI Build Day Vietnam 2026 — Elfie Healthcare Track.

---

## License

MIT