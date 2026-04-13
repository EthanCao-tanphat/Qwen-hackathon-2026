# Healix

> AI-Powered Health Intelligence Platform — Elfie Healthcare Track, Qwen AI Build Day 2026

[![Built with Qwen](https://img.shields.io/badge/AI-Qwen-blue)](https://www.alibabacloud.com/en/solutions/generative-ai/qwen)
[![Alibaba Cloud](https://img.shields.io/badge/Cloud-Alibaba-orange)](https://www.alibabacloud.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Healix transforms raw medical data — lab PDFs, consultation audio, body images — into structured, patient-friendly health insights. Three AI tools, one platform, powered entirely by Qwen models on Alibaba Cloud.

---

## Features

| Feature | Input | Output | Qwen Models |
|---------|-------|--------|-------------|
| 🧪 **Labs Analyzer** | Lab report PDF (EN/FR/AR/VN) | Structured results, severity classification, patient explanations | Qwen-VL + Qwen-Max |
| 🎙️ **Clinical Scribe** | Consultation audio (EN/FR/AR/VN) | Transcript, SOAP note, structured clinical report | Qwen-Audio + Qwen-Max |
| 🤖 **Body Scan** | Front + side body photos | Body measurements, body fat %, health category | Qwen-VL + Qwen-Max |

---

## Architecture

```
Frontend (React + Vite)
    │
    ├── Labs Analyzer Page
    ├── Clinical Scribe Page
    └── Body Scan Page
         │
    ┌────▼─────────────────────────────┐
    │   FastAPI Backend                │
    │                                  │
    │   Shared Multilingual Layer      │
    │   (EN / FR / AR / VN)            │
    │                                  │
    │   POST /api/labs/analyze         │
    │   POST /api/scribe/transcribe    │
    │   POST /api/bodyscan/analyze     │
    └────┬──────┬──────┬───────────────┘
         │      │      │
      Qwen-VL  Qwen   Qwen-VL
         +     Audio     +
      Qwen-Max   +    Qwen-Max
               Qwen-Max
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Alibaba Cloud DashScope API key ([Get one here](https://dashscope.console.aliyun.com/))

### 1. Clone the repo

```bash
git clone https://github.com/your-team/healix.git
cd healix
```

### 2. Backend setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your DASHSCOPE_API_KEY

# Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`. Check health at `http://localhost:8000/health`.

### 3. Frontend setup

```bash
cd frontend

npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Robot arm setup (optional)

```bash
cd robot

# Install robot dependencies
pip install -r requirements.txt

# Configure camera and robot arm serial port in config.py
# Run the capture server
python capture_server.py
```

---

## API Reference

### `POST /api/labs/analyze`

Upload a lab report PDF for analysis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | file | Yes | Lab report PDF |
| `language` | string | No | `en`, `fr`, `ar`, `vn`, or `auto` (default) |

**Response:**
```json
{
  "language_detected": "en",
  "patient_info": { "name": "...", "date": "...", "lab_name": "..." },
  "results": [
    {
      "test_name": "Hemoglobin",
      "value": "12.5",
      "unit": "g/dL",
      "reference_range": "13.5-17.5",
      "status": "low",
      "severity": "moderate",
      "explanation": "Your hemoglobin is below the normal range...",
      "next_steps": ["Include iron-rich foods...", "Follow up with your doctor..."]
    }
  ],
  "summary": "Overall patient-friendly summary",
  "urgent_flags": [],
  "total_tests_found": 22,
  "abnormal_count": 4
}
```

### `POST /api/scribe/transcribe`

Upload consultation audio for transcription and clinical report generation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audio` | file | Yes | Audio file (wav, mp3, m4a, ogg) |
| `language` | string | No | `en`, `fr`, `ar`, `vn`, or `auto` (default) |

**Response:**
```json
{
  "language_detected": "en",
  "transcript": "Doctor: What brings you in today?...",
  "clinical_report": {
    "chief_complaint": "...",
    "symptoms": [{ "name": "fever", "duration": "3 days", "severity": "moderate" }],
    "diagnosis": { "primary": "...", "differential": ["..."] },
    "medications": [{ "name": "...", "dosage": "...", "frequency": "...", "duration": "..." }],
    "follow_up": "..."
  },
  "soap_note": "SOAP NOTE\n========\n\nSUBJECTIVE:..."
}
```

### `POST /api/bodyscan/analyze`

Upload body images for measurement and body fat estimation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `front_image` | file | Yes | Front-facing body photo |
| `side_image` | file | No | Side profile body photo |
| `height_cm` | float | Yes | Height in centimeters |
| `weight_kg` | float | Yes | Weight in kilograms |
| `gender` | string | No | `male` or `female` (default: male) |
| `age` | int | No | Age in years (default: 25) |

**Response:**
```json
{
  "measurements": {
    "neck_cm": 34.4,
    "shoulder_cm": 43.3,
    "upper_chest_cm": 86.8,
    "upper_arm_cm": 26.4,
    "waist_cm": 99.6,
    "hip_cm": 95.3,
    "thigh_cm": 57.6,
    "calf_cm": 36.3
  },
  "body_composition": {
    "body_fat_pct": 18.5,
    "category": "Fitness",
    "bmi": 24.2,
    "lean_mass_kg": 65.0,
    "fat_mass_kg": 14.8
  }
}
```

---

## Project Structure

```
healix/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── routes/
│   │   │   ├── labs.py          # Labs Analyzer endpoint
│   │   │   ├── scribe.py       # Clinical Scribe endpoint
│   │   │   └── bodyscan.py     # Body Scan endpoint
│   │   └── shared/
│   │       ├── qwen_client.py   # Qwen API client (VL, Audio, Max)
│   │       └── multilingual.py  # Language detection & prompting
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   └── App.jsx              # React single-page app
│   ├── package.json
│   └── vite.config.js
├── robot/                        # Robot arm capture scripts
├── HEALIX.md                     # Project description
└── README.md                     # This file
```

---

## Evaluation Alignment

### Labs Analyzer (5 dimensions)
- ✅ Clinical correctness — validated against reference ranges
- ✅ Severity accuracy — 5-tier classification (normal → critical)
- ✅ Completeness — extracts ALL tests from multi-page PDFs
- ✅ Actionability — concrete next steps, not generic advice
- ✅ UX clarity — color-coded severity, expandable explanations

### Clinical Scribe (5 dimensions)
- ✅ Clinical correctness — SOAP format, proper medical terminology
- ✅ Multilingual handling — EN/FR/AR/VN audio support
- ✅ Completeness — captures all symptoms, meds, findings
- ✅ Actionability — structured treatment plan and follow-up
- ✅ UX clarity — tabbed transcript / report / SOAP note views

### Body Scan (2 dimensions)
- ✅ Measurement accuracy — robot-calibrated at fixed distance
- ✅ Body Fat Ratio accuracy — Navy Method + BMI cross-validation

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Models | Qwen-VL, Qwen-Audio, Qwen-Max |
| AI Platform | Alibaba Cloud Model Studio |
| Backend | FastAPI (Python 3.11) |
| Frontend | React 19 + Vite |
| PDF Processing | PyMuPDF |
| Body Fat Calc | U.S. Navy Method + Deurenberg BMI Method |
| Robot | Python + serial camera control |
| Deployment | Alibaba Cloud ECS, Docker Compose |

---

## Deployment

### Docker Compose

```yaml
version: "3.8"
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

```bash
docker compose up --build
```

---

## Team

Built by 4 builders in 6 days for the Elfie Healthcare Track at Qwen AI Build Day Vietnam 2026.

---

## License

MIT

---

<p align="center"><b>Healix</b> — because health data should heal, not confuse.</p>
