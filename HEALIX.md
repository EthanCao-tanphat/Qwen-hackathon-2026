# Healix

### AI-Powered Health Intelligence Platform

Healix is a unified health AI platform that transforms raw medical data into structured, actionable insights — powered by Qwen on Alibaba Cloud.

Three challenges. One platform. Zero medical jargon.

---

## What It Does

**🧪 Labs Analyzer** — Drop a lab report PDF in any language (EN/FR/AR/VN). Healix extracts every test result, validates it against 50+ medical reference ranges, classifies severity across 5 tiers, and explains what it means in plain language a patient can actually understand.

**🎙️ Clinical Scribe** — Upload a doctor-patient consultation recording. Healix transcribes the conversation across four languages **with speaker diarization** (Doctor/Patient separation), identifies symptoms, diagnoses, and medications, then generates a structured SOAP clinical note — saving doctors 10–15 hours per week.

**🧍 Body Scan + Heart Rate** — A two-part body intelligence workflow:
- **Heart Rate** — Place a fingertip over the camera. Healix uses photoplethysmography (PPG) to measure BPM, HRV, and heart rate zone in 20 seconds.
- **Body Scan** — Capture front and side photos with real-time voice-guided auto-capture. Healix estimates 22+ body measurements, body fat percentage via the U.S. Navy Method, and analyzes posture — all with per-measurement confidence scores.

---

## Why Healix

- **Multilingual from day one** — EN, FR, AR, VN. Built for Elfie's 30+ country footprint.
- **Clinically grounded** — Severity classification based on medical reference ranges, not vibes. Deterministic server-side calculations for body fat, BMI, WHR, and BMR cross-validate AI outputs.
- **Patient-first** — Every output is written at an 8th-grade reading level. No jargon, no confusion.
- **Voice-guided scanning** — A real-time assistant guides the user through body photo capture — checking distance, lighting, pose, angle, and clothing fit. Auto-shutter fires only when everything is perfect. No other tool in this space works this way.
- **Heart rate from any phone** — No smartwatch, no wearable. Just a finger over the camera for 20 seconds.
- **Speaker-aware transcription** — Clinical Scribe separates doctor and patient voices automatically, so the SOAP note's Subjective section reflects what the patient actually said.
- **Privacy by design** — Stateless backend. No database. No accounts. Audio passes through a temporary Cloudinary URL for Qwen ASR access and is deleted immediately after transcription. Everything else stays in memory.
- **One platform** — Three tools, one codebase, one UI. Seamless experience for doctors and patients.

---

## How It's Built

**Two-stage AI pipeline** for every tool:
1. **Extraction** — Qwen-VL reads images and PDFs; Qwen ASR transcribes and diarizes audio
2. **Reasoning** — Qwen-Max applies clinical judgment, generates patient-friendly explanations

Between the two stages, server-side validation catches OCR errors, cross-checks against medical reference ranges, and prevents hallucinations downstream.

---

## The Team

Four builders. Six days. Built for the Elfie Healthcare Track at Qwen AI Build Day 2026.

---

## Built With

- **Qwen-VL** — Vision-language model for PDF parsing, body image analysis, and live photo evaluation
- **Qwen ASR** — Speech-to-text with speaker diarization for Clinical Scribe
- **Qwen-Max** — Clinical reasoning, structured extraction, patient explanations
- **Alibaba Cloud Dashscope** — Model Studio API (Singapore endpoint)
- **Cloudinary** — Short-lived audio hosting to feed Qwen ASR (file deleted immediately after transcription)
- **FastAPI** — Python backend with async Qwen client
- **React 19 + Vite** — Frontend UI with voice guidance and camera integration
- **Web APIs** — MediaDevices, SpeechSynthesis, DeviceOrientation — all native, no SDKs
- **Stdlib-only PPG algorithm** — Heart rate signal processing written in pure Python (no numpy/scipy calls in the algorithm itself)

---

*Healix — because health data should heal, not confuse.*