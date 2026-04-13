"""
Clinical Scribe — transcribe consultation audio and generate SOAP notes.
"""

import json
from fastapi import APIRouter, UploadFile, File, Form
from app.shared.qwen_client import call_qwen_audio, call_qwen_max, encode_file_b64
from app.shared.multilingual import get_response_language_instruction, validate_language

router = APIRouter()

TRANSCRIBE_SYSTEM = """You are a medical audio transcription specialist.
Transcribe the doctor-patient conversation accurately.
Identify speakers as "Doctor:" and "Patient:" on separate lines.
Preserve medical terminology exactly as spoken."""

CLINICAL_SYSTEM_TEMPLATE = """You are a clinical documentation AI.
Given a doctor-patient consultation transcript, generate a structured clinical report.

{lang_instruction}

Return valid JSON:
{{
  "clinical_report": {{
    "chief_complaint": "string",
    "symptoms": [ {{ "name": "string", "duration": "string", "severity": "string" }} ],
    "diagnosis": {{ "primary": "string", "differential": ["string"] }},
    "medications": [ {{ "name": "string", "dosage": "string", "frequency": "string", "duration": "string" }} ],
    "follow_up": "string"
  }},
  "soap_note": "Full SOAP note as a formatted string"
}}"""

AUDIO_FORMAT_MAP = {
    "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/mpeg": "mp3", "audio/mp3": "mp3",
    "audio/mp4": "m4a", "audio/x-m4a": "m4a",
    "audio/ogg": "ogg",
}


@router.post("/transcribe")
async def transcribe_consultation(
    audio: UploadFile = File(...),
    language: str = Form("auto"),
):
    language = validate_language(language)
    audio_bytes = await audio.read()
    audio_b64 = encode_file_b64(audio_bytes)
    file_format = AUDIO_FORMAT_MAP.get(audio.content_type, "wav")

    transcript = await call_qwen_audio(
        system_prompt=TRANSCRIBE_SYSTEM,
        audio_b64=audio_b64,
        file_format=file_format,
    )

    lang_instruction = get_response_language_instruction(language)
    clinical_system = CLINICAL_SYSTEM_TEMPLATE.format(lang_instruction=lang_instruction)

    report_raw = await call_qwen_max(
        system_prompt=clinical_system,
        user_prompt=f"Consultation transcript:\n\n{transcript}",
    )

    try:
        cleaned = report_raw.strip().removeprefix("```json").removesuffix("```").strip()
        report = json.loads(cleaned)
    except json.JSONDecodeError:
        report = {"raw_response": report_raw, "parse_error": True}

    return {"language_detected": language, "transcript": transcript, **report}
