<div align="center">

# Healix ⚕️

### AI-Powered Health Intelligence Platform

Transform lab reports, consultations, and body scans into insights anyone can understand.

[![Qwen](https://img.shields.io/badge/Qwen-VL%20%7C%20ASR%20%7C%20Max-1E90FF)](https://www.alibabacloud.com/product/modelstudio)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://python.org)

Built for the **Qwen AI Build Day 2026 · Elfie Healthcare Track**

[Features](#features) · [Architecture](#architecture) · [Getting Started](#getting-started) · [API](#api-reference) · [Deployment](#deployment)

</div>

---

## What is Healix?

Healix is a unified health AI platform that takes raw medical data — lab reports, consultation recordings, body photos, fingertip pulse — and turns them into structured, actionable insights that patients and clinicians can act on immediately.

**Three tools. One platform. Zero medical jargon.**

Every output is written at an 8th-grade reading level. Supports **English, French, Arabic, and Vietnamese** out of the box.

---

## Features

### 🧪 Labs Analyzer

Drop any lab report PDF — get back every test result classified across 5 severity tiers, grouped by organ system, with plain-language explanations and concrete next steps.

- **Vision-based extraction** — Qwen-VL reads scanned PDFs, printed labs, phone photos
- **5-tier severity classification** — Normal → Mild → Moderate → Severe → Critical
- **50+ medical reference ranges** built-in for cross-validation
- **Organ-system grouping** — Liver, Kidney, Cardiovascular, Metabolic, Blood, Thyroid
- **Plain-language explanations** — reading level checked against 8th-grade target
- **Multilingual** — EN, FR, AR, VN

### 🎙️ Clinical Scribe

Upload a consultation recording — get transcripts with speaker diarization, structured clinical data, and a SOAP note ready for the chart in seconds.

- **Speech → transcript** via Qwen ASR (async API) with speaker diarization
- **Doctor/Patient separation** — each utterance is labeled so the SOAP Subjective section uses only the patient's words
- **Structured clinical report** — chief complaint, symptoms, diagnosis, medications, follow-up
- **SOAP note generation** — Subjective, Objective, Assessment, Plan
- **Saves 10–15 hours/week** for clinicians based on pilot estimates
- **Multilingual** — transcribes and summarizes in 4 languages

### 🧍 Body Scan + Heart Rate

A two-part body intelligence workflow that replaces Bodygram SDK with a Qwen-VL pipeline, plus real-time PPG heart rate measurement.

**Heart Rate (PPG)**
- Fingertip-over-camera scan with optional flash
- 20-second capture at 10 FPS
- Red-channel signal extraction → bandpass filter → peak detection
- Returns BPM, HRV (SDNN), heart rate zone, confidence

**Body Measurements**
- Voice-guided photo capture with real-time pose/lighting/angle feedback
- Auto-capture fires when all criteria pass (distance, pose, camera level, clothing fit)
- **22+ measurements** — circumferences, lengths, widths
- **Reference-object calibration** — hold a credit card or A4 paper for pixels-per-cm scale
- **U.S. Navy Method body fat** with BMI cross-validation
- **Posture analysis** — head, shoulders, spine, hips, knees + severity rating
- **Per-measurement confidence scores**
- **AI health insights** — body shape classification, cardiovascular risk, fitness recommendations

---

## Architecture

High-level design, data flow, and model choices are documented in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Quick summary:

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   React + Vite   │ HTTP  │   FastAPI         │ HTTP  │  Dashscope API   │
│   (frontend)     ├──────▶│   (backend)       ├──────▶│  Qwen-VL, ASR,   │
│                  │       │                   │       │  Max (Singapore) │
└──────────────────┘       └────────┬──────────┘       └──────────────────┘
                                    │
                                    ├─▶ Cloudinary (temp audio host for Scribe)
                                    └─▶ PyMuPDF / Pillow (PDF + image handling)
```

**Key design choices:**
- **Stateless backend** — no database, no user accounts, no stored data
- **Two-step AI pipeline** per tool: specialized extraction (VL / ASR) → clinical reasoning (Max)
- **Server-side validation** — reference ranges, anatomical ratios, signal sanity checks
- **Multilingual by default** — every tool supports EN/FR/AR/VN via a single `language` param
- **Temporary audio hosting** — Scribe audio is uploaded to Cloudinary only so Qwen ASR can fetch it via URL, then deleted immediately after transcription

---

## Tech Stack

| Layer | Technology |
|---|---|
| **AI Models** | Qwen-VL (vision), Qwen ASR (speech + diarization), Qwen-Max (reasoning) |
| **AI Infrastructure** | Alibaba Cloud Dashscope (Singapore endpoint) |
| **Audio hosting** | Cloudinary (temporary URLs, auto-deleted) |
| **Backend** | FastAPI · Python 3.9+ · Uvicorn · httpx (async) |
| **PDF/Image** | PyMuPDF · Pillow |
| **Frontend** | React 19 · Vite 6 · React Router 7 |
| **Styling** | Inline CSS modules + design tokens (no CSS framework) |
| **Camera/Audio** | Web MediaDevices API · Web Speech API · DeviceOrientationEvent |

---

## Project Structure

```
healix-project/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, routers
│   │   ├── routes/
│   │   │   ├── labs.py             # POST /api/labs/analyze
│   │   │   ├── scribe.py           # POST /api/scribe/transcribe
│   │   │   ├── bodyscan.py         # POST /api/bodyscan/analyze
│   │   │   │                       # POST /api/bodyscan/evaluate-photo
│   │   │   └── heartrate.py        # POST /api/heartrate/analyze-frames
│   │   └── shared/
│   │       ├── qwen_client.py      # Unified Dashscope client (VL + ASR + Max)
│   │       └── multilingual.py     # Language detection + prompts
│   ├── requirements.txt
│   └── .env                        # DASHSCOPE_API_KEY, CLOUDINARY_* (not committed)
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                 # Router (/, /labs, /scribe, /bodyscan)
│   │   ├── pages/
│   │   │   ├── Landing.jsx         # Hero + features + stack + footer
│   │   │   ├── Labs.jsx
│   │   │   ├── Scribe.jsx
│   │   │   └── BodyScan.jsx        # 4-step: info → heartrate → photos → results
│   │   ├── components/ui/
│   │   │   ├── Layout.jsx
│   │   │   ├── FileUpload.jsx
│   │   │   ├── GuidedCapture.jsx   # Voice-guided body photo capture
│   │   │   └── HeartRateScan.jsx   # PPG heart rate with animated ECG
│   │   └── lib/
│   │       └── api.js              # Fetch wrappers for all endpoints
│   ├── package.json
│   └── vite.config.js              # Proxy /api → localhost:8000
│
├── ARCHITECTURE.md
├── HEALIX.md
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python 3.9+**
- **Node.js 18+** and npm
- **Dashscope API key** — get one at [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com) (Singapore region for international access)
- **Cloudinary account** (free tier) — needed only for Clinical Scribe. Sign up at [cloudinary.com](https://cloudinary.com) and grab your cloud name, API key, and API secret.

### Backend Setup

```bash
cd backend

# Create virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure credentials
cat > .env <<EOF
DASHSCOPE_API_KEY=sk-your-key-here
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-key
CLOUDINARY_API_SECRET=your-cloudinary-secret
EOF

# Start server
python3 -m uvicorn app.main:app --reload --port 8000
```

Backend will be available at `http://localhost:8000`. Health check: `http://localhost:8000/`.

### Frontend Setup

In a second terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend will be available at `http://localhost:5173`. API calls are proxied to the backend automatically.

### Verify Installation

1. Visit `http://localhost:5173` — you should see the Healix landing page
2. Click **Get Started** or navigate to `/labs`, `/scribe`, `/bodyscan`
3. Upload a sample file and confirm results come back from the AI

---

## API Reference

All endpoints return JSON. Errors follow FastAPI's standard `{ "detail": "message" }` format.

### Labs Analyzer

```
POST /api/labs/analyze
Content-Type: multipart/form-data

Fields:
  file:     PDF or image (required)
  language: "auto" | "en" | "fr" | "ar" | "vi"  (default: "auto")
```

**Response:** Extracted test results with severity, organ grouping, explanations, and next steps.

### Clinical Scribe

```
POST /api/scribe/transcribe
Content-Type: multipart/form-data

Fields:
  audio:    WAV/MP3/M4A/OGG (required)
  language: "auto" | "en" | "fr" | "ar" | "vi"
```

**Response:** Diarized transcript (Doctor/Patient tagged) + structured clinical report + SOAP note.

### Body Scan

```
POST /api/bodyscan/analyze
Content-Type: multipart/form-data

Fields:
  front_image:           JPEG/PNG (required)
  side_image:            JPEG/PNG (optional, improves accuracy)
  height_cm:             float (required)
  weight_kg:             float (required)
  gender:                "male" | "female"
  age:                   int
  language:              "auto" | "en" | "fr" | "ar" | "vi"
  has_reference_object:  boolean (if user included a credit card/A4 for calibration)
```

**Response:** 22+ measurements with confidence, body composition, posture analysis, health insights.

### Photo Best-Shot Evaluator

```
POST /api/bodyscan/evaluate-photo
Content-Type: multipart/form-data

Fields:
  image:      JPEG (required) — single frame from camera preview
  photo_type: "front" | "side"
```

**Response:** `{ ready, overall_score, criteria: {...}, suggestion }` — used by the frontend's guided capture loop to decide when to auto-shoot.

### Heart Rate

```
POST /api/heartrate/analyze-frames
Content-Type: multipart/form-data

Fields:
  frames: multiple JPEG files (required) — ~200 frames at 10 FPS
  fps:    int (default: 10)
```

**Response:** `{ bpm, hrv_sdnn, zone, confidence }`.

---

## Deployment

### Frontend → Vercel

1. Push the repo to GitHub
2. Import on Vercel, set root directory to `frontend`
3. Add env var: `VITE_API_URL` = your backend URL

### Backend → Hugging Face Spaces (Docker) or Railway

1. Point the platform at `backend/` as root
2. For HF Spaces: include a `Dockerfile` that runs `uvicorn app.main:app --host 0.0.0.0 --port 7860`
3. For Railway: start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add env vars: `DASHSCOPE_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

Camera features (heart rate, guided body capture) **require HTTPS**, which Vercel, HF Spaces, and Railway all provide by default.

---

## Privacy & Data

- **No database.** No user accounts. No stored data on the Healix backend.
- **Lab PDFs and body images** are processed in memory and discarded after the response is returned.
- **Consultation audio** is uploaded to a short-lived Cloudinary URL so Qwen ASR can fetch it. The file is deleted from Cloudinary **immediately** after transcription completes. The transcript itself lives only in memory during the request.
- **API keys are never exposed** to the client. All Dashscope and Cloudinary calls go through the backend.
- **The `.env` file is gitignored** and must be set per deployment.

---

## Multilingual Support

Every endpoint accepts a `language` parameter:

| Code | Language |
|---|---|
| `auto` | Auto-detect from input (default) |
| `en` | English |
| `fr` | French |
| `ar` | Arabic |
| `vi` | Vietnamese |

Labs, Body Scan, and Scribe all use Qwen-Max prompts localized to the target language. Clinical Scribe additionally passes the language hint to Qwen ASR so speaker diarization and transcription are optimized for that language.

---

## Roadmap

- [ ] Expand Body Scan to 35+ measurements to fully match Bodygram parity
- [ ] Add longitudinal tracking (requires optional user accounts)
- [ ] Add DICOM support for Labs Analyzer (imaging reports)
- [ ] Mobile app wrapper (React Native / Capacitor)
- [ ] Self-hosted audio storage option to remove the Cloudinary dependency

---

## License

Not yet finalized. Built for the Qwen AI Build Day 2026 hackathon.

---

## Credits

Built with ❤️ for the **Elfie Healthcare Track · Qwen AI Build Day Vietnam 2026**.

Powered by Qwen-VL, Qwen ASR, and Qwen-Max on Alibaba Cloud Model Studio.