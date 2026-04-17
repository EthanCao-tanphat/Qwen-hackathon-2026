# Healix — Architecture

This document describes the system design of Healix, including request flow, AI pipeline, data handling, and key design decisions.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Request Flow](#2-request-flow)
3. [AI Pipeline](#3-ai-pipeline)
4. [Per-Tool Architecture](#4-per-tool-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Multilingual Layer](#7-multilingual-layer)
8. [Privacy & Statelessness](#8-privacy--statelessness)
9. [Design Decisions](#9-design-decisions)
10. [Performance & Cost](#10-performance--cost)

---

## 1. System Overview

Healix has three logical layers. The backend is stateless; one external service (Cloudinary) temporarily holds audio for a single tool.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser / Mobile Web                        │
│  React + Vite UI · Web Camera · Web Speech · DeviceOrientation  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend                           │
│  /api/labs · /api/scribe · /api/bodyscan · /api/heartrate        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ qwen_client  │  │ multilingual │  │ stdlib signal        │   │
│  │ (Dashscope)  │  │ (prompt i18n)│  │ processing (PPG)     │   │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘   │
└─────────┼─────────────────────┬──────────────────────────────────┘
          │ HTTPS               │ HTTPS (Scribe only)
          ▼                     ▼
┌──────────────────────┐  ┌────────────────────────────────────┐
│  Alibaba Cloud       │  │  Cloudinary                         │
│  Dashscope (SG)      │  │  Temporary audio URL for Qwen ASR   │
│  Qwen-VL, ASR, Max   │  │  (file auto-deleted after use)      │
└──────────────────────┘  └────────────────────────────────────┘
```

**External dependencies:**
- **Dashscope** (required) — Qwen-VL, Qwen ASR, and Qwen-Max for vision, speech, and reasoning
- **Cloudinary** (required for Clinical Scribe only) — short-lived audio hosting so Qwen ASR can download the file via URL

**Internal modules:**
- `qwen_client.py` — single async HTTP client for all Qwen calls (VL, ASR, Max)
- `multilingual.py` — language validation and prompt localization
- `routes/*.py` — one router per tool, each self-contained

---

## 2. Request Flow

A typical end-to-end flow for any of the four tools:

```
1. User action (upload / record / capture)
        ↓
2. Frontend validates input client-side (file type, size, required fields)
        ↓
3. Frontend sends multipart/form-data to backend endpoint
        ↓
4. Backend validates payload via FastAPI's type system
        ↓
5. Backend runs the tool's pipeline (see §3)
        ↓
6. Backend returns structured JSON response
        ↓
7. Frontend renders results (severity badges, measurements grid, BPM, etc.)
```

**No persistence on the Healix backend.** Every request is independent. The only data that briefly leaves the backend is Clinical Scribe audio, which transits through a Cloudinary URL purely so Qwen ASR can fetch it — and is deleted immediately after the transcription call returns.

---

## 3. AI Pipeline

All four tools follow the same two-stage pattern, inspired by the "extractor + reasoner" design used by clinical AI teams:

```
                   ┌────────────────────────┐
Input file ──────▶ │  STAGE 1: EXTRACTION    │
                   │  Specialized Qwen model │
                   │  (VL for images/PDFs    │
                   │   or ASR for audio)     │
                   └─────────────┬──────────┘
                                 │ Structured JSON
                                 ▼
                   ┌────────────────────────┐
                   │  SERVER-SIDE VALIDATION │
                   │  Reference ranges,      │
                   │  anatomical ratios,     │
                   │  signal sanity checks   │
                   └─────────────┬──────────┘
                                 │
                                 ▼
                   ┌────────────────────────┐
                   │  STAGE 2: REASONING     │
                   │  Qwen-Max               │
                   │  Clinical interpretation│
                   │  + patient explanations │
                   └─────────────┬──────────┘
                                 │ Final JSON
                                 ▼
                         Frontend renders
```

**Why two stages?** Extraction models (VL, ASR) hallucinate less when constrained to structured output. Reasoning is better handled by a text-only LLM (Max) that can see the full extracted structure and apply clinical judgment.

**Why server-side validation between stages?** It catches OCR errors early (e.g., Qwen misreading "5.0 mg/dL" as "50 mg/dL"), cross-checks against known medical reference ranges, and prevents downstream hallucination in stage 2.

---

## 4. Per-Tool Architecture

### 4.1 Labs Analyzer (`/api/labs/analyze`)

```
PDF upload
   │
   ├─▶ PyMuPDF: rasterize pages to images
   │
   ├─▶ Qwen-VL: extract every test result
   │   → [{test_name, value, unit, reference_range}, ...]
   │
   ├─▶ Server: validate against 50+ built-in reference ranges
   │   → attach normalized status (normal/low/high/critical)
   │   → group by organ system
   │
   ├─▶ Qwen-Max: clinical interpretation
   │   → 5-tier severity per test
   │   → plain-language explanation (8th-grade)
   │   → concrete next steps
   │
   └─▶ Response JSON
```

**Design notes:**
- Reference ranges are stored as constants in `labs.py` (not a database) — fast, auditable
- Severity classification uses **% deviation** from the normal range, not raw z-scores
- Explanations are generated in the user's language via `multilingual.py`

### 4.2 Clinical Scribe (`/api/scribe/transcribe`)

```
Audio upload (WAV/MP3/M4A/OGG)
   │
   ├─▶ Backend: upload to Cloudinary (temporary URL)
   │
   ├─▶ Qwen ASR (async API): transcribe + diarize from URL
   │   → segments: [{speaker: "Doctor"|"Patient", text, start, end}]
   │
   ├─▶ Backend: delete the Cloudinary file IMMEDIATELY
   │
   ├─▶ Qwen-Max: clinical structuring (operates on transcript only)
   │   → chief complaint
   │   → symptoms [{name, duration, severity}]
   │   → diagnosis {primary, differential}
   │   → medications [{name, dosage, frequency, duration}]
   │   → follow-up
   │   → full SOAP note as formatted string
   │
   └─▶ Response JSON (transcript + clinical report + SOAP)
```

**Design notes:**
- **Why Cloudinary as an intermediate step?** Qwen ASR's async API accepts audio via URL, not inline base64. A temporary Cloudinary URL is the simplest way to give Qwen a fetchable HTTPS endpoint for the audio without persisting it anywhere long-term.
- **The Cloudinary upload is a transient pass-through.** The file is deleted the moment transcription completes — typically within 10–20 seconds. It never appears in any Cloudinary folder browsable via the dashboard beyond that window.
- **Speaker diarization** is performed by Qwen ASR in the same call as transcription. The SOAP note's Subjective section is derived only from utterances tagged `Patient`, while the Objective/Assessment sections use context from both speakers.
- SOAP note formatting follows standard clinical documentation conventions (Subjective, Objective, Assessment, Plan).

### 4.3 Body Scan (`/api/bodyscan/analyze` + `/api/bodyscan/evaluate-photo`)

```
Two endpoints:
┌─────────────────────────────────────────┐
│ /evaluate-photo (called repeatedly by UI)│
│ Input:  single frame + photo_type        │
│ Output: {ready, score, criteria, fix}    │
│ Used for real-time "Best Shot" guidance  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ /analyze (called once when captured)     │
│                                          │
│ Front + side photos, height, weight      │
│    │                                     │
│    ├─▶ Qwen-VL: optional calibration    │
│    │   detects reference object         │
│    │   (credit card, A4 paper)           │
│    │                                     │
│    ├─▶ Qwen-VL: 22+ measurements        │
│    │   per-measurement confidence       │
│    │   front = widths, side = depths    │
│    │   elliptical model for circumf.    │
│    │                                     │
│    ├─▶ Qwen-VL: posture analysis        │
│    │   head, shoulders, spine, hips     │
│    │                                     │
│    ├─▶ Server: body composition calc    │
│    │   U.S. Navy body fat method        │
│    │   BMI, WHR, BMR (Mifflin-St Jeor)  │
│    │                                     │
│    └─▶ Qwen-Max: health insights        │
│        body shape, cardiovascular risk, │
│        fitness recommendations          │
└─────────────────────────────────────────┘
```

**Design notes:**
- Body fat formula is **deterministic server-side math** — not AI output. Waist/neck/hip from Qwen-VL feed into the Navy Method equations directly.
- Front + side fusion uses `C ≈ π·√(2·(a² + b²))` elliptical approximation for circumferences.
- `/evaluate-photo` is called every ~2.5s during live capture. It's lightweight (~1s round-trip) because it only evaluates one small frame.

### 4.4 Heart Rate (`/api/heartrate/analyze-frames`)

```
200 JPEG frames @ 10 FPS (20s of finger-over-camera video)
   │
   ├─▶ Pillow: extract red channel average per frame
   │   → 200-sample PPG signal
   │
   ├─▶ Bandpass filter (0.7–3.5 Hz = 42–210 BPM)
   │   → denoised heart rate signal
   │
   ├─▶ Peak detection
   │   → peak-to-peak intervals in ms
   │
   ├─▶ BPM = 60000 / mean(intervals)
   ├─▶ HRV (SDNN) = std(intervals)
   ├─▶ Zone = classify(BPM, age)
   └─▶ Confidence = signal_quality_score
```

**Design notes:**
- **The PPG algorithm itself uses only Python stdlib** (`math`, `statistics`) — no numpy or scipy calls inside `heartrate.py`. (numpy/scipy appear in `requirements.txt` as transitive dependencies of other packages, not direct imports by the heart-rate code.)
- The client flashes the device torch (via `MediaStreamTrack.applyConstraints({ advanced: [{ torch: true }] })`) to illuminate the fingertip for a clean PPG signal.
- Signal quality is judged by peak regularity and amplitude variance.

---

## 5. Frontend Architecture

```
src/
├── main.jsx                 # React entry point
├── App.jsx                  # Routes: / /labs /scribe /bodyscan
│
├── pages/
│   ├── Landing.jsx          # Marketing landing with SpiralCanvas
│   ├── Labs.jsx             # Upload → analyze → render results
│   ├── Scribe.jsx           # Same pattern for audio
│   └── BodyScan.jsx         # State machine: info→heartrate→capture→results
│
├── components/ui/
│   ├── Layout.jsx           # Shared nav
│   ├── FileUpload.jsx       # Reusable drag-drop upload
│   ├── GuidedCapture.jsx    # Camera + voice guidance + auto-capture
│   └── HeartRateScan.jsx    # PPG camera + animated ECG waveform
│
└── lib/
    └── api.js               # Typed fetch wrappers for every endpoint
```

### 5.1 BodyScan as a State Machine

`BodyScan.jsx` is the most complex page. It's modeled as a 4-step state machine:

```
      ┌──── info ────┐
      │ Height/weight │
      │ Gender/age    │
      └───────┬───────┘
              │ canProceed?
              ▼
      ┌── heartrate ──┐
      │ PPG scan      │
      │ (skippable)   │
      └───────┬───────┘
              │
              ▼
      ┌──── capture ──┐
      │ Guided photos │
      │ Front + side  │
      └───────┬───────┘
              │ photos ready
              ▼
      ┌──── results ──┐
      │ HR + body     │
      │ measurements  │
      └───────────────┘
```

Each step is its own rendered component. Heart rate data persists in parent state even if the user proceeds to photos, so the final results screen can display both.

### 5.2 GuidedCapture — The Best Shot Loop

```
Camera permission granted
   │
   ▼
Start video preview (back cam on mobile, webcam on desktop)
   │
   ▼
Every 2.5s:
   │
   ├─▶ Grab current frame
   ├─▶ POST to /api/bodyscan/evaluate-photo
   ├─▶ Read {ready, score, criteria, suggestion}
   │
   ├─▶ If ready:
   │   ├─▶ Speak "Perfect, hold still"
   │   └─▶ Auto-capture after next confirmation
   │
   └─▶ If not ready:
       ├─▶ Find worst criterion
       ├─▶ Speak fix instruction (EN or VN)
       └─▶ Update border color (red/yellow/green)

User can also:
   ├─▶ Tap manual shutter (unlocks after 8s)
   ├─▶ Use best frame seen so far (unlocks after 45s)
   └─▶ Switch to upload mode
```

The Best Shot loop sends ~15 frames per photo to the backend, totaling ~30 Qwen-VL calls per full scan.

### 5.3 HeartRateScan — ECG Waveform

Instead of emoji hearts, the component renders a real-looking ECG waveform as an SVG:

- **PQRST complex** drawn as an SVG path
- Two copies of the path scroll left-to-right via CSS `animation: ecgScroll linear infinite`
- Animation duration is derived from `60 / bpm` so the visual matches the measured rate
- Color changes based on heart rate zone (blue resting → red max)
- A pulse dot in the center scales with each beat

---

## 6. Backend Architecture

### 6.1 `qwen_client.py`

A single async client for all Qwen calls. Key functions:

- `call_qwen_vl(system_prompt, user_text, images_b64)` — vision
- `call_qwen_max(system_prompt, user_prompt)` — text reasoning
- `call_qwen_asr(audio_url, language)` — speech-to-text with diarization
- `encode_file_b64(bytes)` — helper

All calls go to the **Singapore endpoint** (`dashscope-intl.aliyuncs.com`) because Healix runs on an international Alibaba Cloud account. This was a source of early 401 errors when we used the China endpoint by mistake.

### 6.2 `multilingual.py`

Handles language validation and prompt localization.

- `validate_language(lang)` — normalizes "vn" → "vi", unknown → "auto"
- `get_response_language_instruction(lang)` — returns a prompt line like *"Respond entirely in Vietnamese."*

### 6.3 Routes

Each route is self-contained with its own:
- Pydantic models (if any)
- Qwen prompt templates at the top of the file
- JSON parsing helpers
- Endpoint handler

This keeps related logic together and makes each tool understandable in isolation.

---

## 7. Multilingual Layer

Every endpoint accepts `language: str = Form("auto")`. The flow:

```
1. validate_language(user_input) → normalized code
2. get_response_language_instruction(code) → prompt line injected into system prompt
3. Qwen-Max returns output in the requested language
4. Frontend displays as-is (supports RTL for Arabic via CSS direction: rtl)
```

For Clinical Scribe specifically, the language code is also passed to Qwen ASR as a hint, so transcription and diarization are optimized for the expected language:

| Our code | Spoken language |
|---|---|
| `en` | English |
| `fr` | French |
| `ar` | Arabic |
| `vi` | Vietnamese |
| `auto` | Qwen ASR auto-detects |

---

## 8. Privacy & Statelessness

**The Healix backend stores nothing.** That is by design:

- No database (SQLite, Postgres, Mongo) anywhere in the stack
- No user accounts, no authentication
- No lab PDFs, body images, or transcripts are written to disk on the backend
- API keys are server-side only; the frontend never sees them
- `.env` is gitignored and must be provisioned per deployment

**One honest caveat for Clinical Scribe:** consultation audio takes a brief detour through Cloudinary so Qwen ASR can fetch it by URL. Specifically:

1. Backend receives the audio in memory.
2. Backend uploads it to Cloudinary, receiving a temporary URL.
3. Backend calls Qwen ASR with that URL. Qwen downloads and transcribes.
4. Backend deletes the Cloudinary asset **immediately** after the ASR response returns (typically 10–20 seconds after upload).
5. The transcript lives only in memory during the remainder of the request.

This eliminates nearly all of a typical medical app's compliance surface (HIPAA, GDPR) while being honest that *one* byte-path briefly transits a third-party service. A self-hosted audio proxy is on the roadmap for teams that need to remove even this dependency.

---

## 9. Design Decisions

### Why Qwen-VL + Qwen-Max instead of Qwen-VL alone?

Vision-language models are excellent at extraction but weaker at multi-step reasoning. Using Qwen-Max as a second stage lets the reasoning model see the *structured* extraction and apply clinical logic without having to also parse images.

### Why Qwen ASR + Cloudinary for Clinical Scribe?

We evaluated three paths:
1. **Google Speech Recognition** — free, but no diarization; would require a separate diarization step.
2. **Qwen-Audio via OpenAI-compatible endpoint** — doesn't accept inline base64 audio, and no reliable way to give it a URL.
3. **Qwen ASR (async API) with URL input** — supports diarization natively and is the same vendor as the rest of our pipeline.

Option 3 won on quality (diarization out of the box), coherence (one Dashscope account, one billing surface), and simplicity (no extra post-processing). The only cost is needing a URL for the audio, which Cloudinary solves with a temp upload that we delete right after.

### Why no database?

It's a hackathon. Adding Supabase/Firebase/Postgres would:
- Add deployment complexity
- Require auth, which the judges aren't testing
- Introduce HIPAA-adjacent compliance concerns
- Not change any evaluation criterion

Statelessness is a feature.

### Why a stdlib-only PPG algorithm?

The PPG signal is 200 samples. Bandpass filtering, peak detection, and stats are ~50 lines without numpy. Writing the algorithm in stdlib keeps it portable and easy to audit. (numpy/scipy still appear in `requirements.txt` because other parts of the platform pull them in transitively — we don't fight that.)

### Why auto-capture on the body scan photos?

Pose quality is the #1 determinant of measurement accuracy. Forcing the user to self-pose without feedback produces bad photos. Voice-guided auto-capture makes the photos as good as a trained photographer taking them.

### Why support 4 specific languages?

The Elfie healthcare track targets multinational healthcare deployment. English, French, Arabic, and Vietnamese cover 30+ countries across North Africa, Middle East, Europe, and Southeast Asia — matching Elfie's actual operating footprint.

---

## 10. Performance & Cost

### Latency (rough estimates based on testing)

| Endpoint | Typical latency |
|---|---|
| `/api/labs/analyze` (1–2 page PDF) | 15–30s |
| `/api/scribe/transcribe` (5-min audio) | 15–30s |
| `/api/bodyscan/analyze` (2 photos) | 20–40s |
| `/api/bodyscan/evaluate-photo` | ~1s |
| `/api/heartrate/analyze-frames` | <1s (stdlib Python) |

Most latency comes from Qwen-Max's reasoning stage. The extraction stage is typically 3–5s. Scribe adds a ~1–2s Cloudinary upload before ASR begins.

### Dashscope cost per request (approximate)

| Tool | VL calls | ASR calls | Max calls | Est. cost per request |
|---|---|---|---|---|
| Labs | 1 | 0 | 1 | ~$0.02 |
| Scribe | 0 | 1 | 1 | ~$0.015 |
| Body Scan (analyze) | 3 | 0 | 1 | ~$0.04 |
| Body Scan (Best Shot loop) | ~15 | 0 | 0 | ~$0.08 total |

A full body scan session (info → heart rate → live guidance → analysis) costs roughly **$0.12 per user**. The hackathon budget of $80 covers ~650 full scans.

Cloudinary cost is effectively zero at hackathon scale — transient uploads under the free tier (25 credits/month).

### Scaling considerations

- The backend is CPU-bound only during PDF rasterization (PyMuPDF) and PPG signal processing. Both are fast.
- Actual latency is dominated by Qwen calls, which are network-bound on Dashscope's side.
- A single FastAPI worker on a free-tier host (HF Spaces, Railway) handles ~5 concurrent users comfortably.
- For >20 concurrent users, scale horizontally with `--workers 4` or more replicas.

---

## Summary

Healix is intentionally simple:

- **One pattern** for every tool: extract → validate → reason → respond
- **One client** for all Qwen calls (VL, ASR, Max)
- **No state** on our backend
- **One transient external hop** (Cloudinary) for one tool, documented honestly
- **Every feature** has a clear reason to exist

That simplicity is what makes it reliable in a 6-day hackathon, and what makes it production-ready with modest additions (auth, longitudinal storage, rate limiting, self-hosted audio proxy) for real deployment.