"""
Clinical Scribe — transcribe consultation audio and generate SOAP notes.
Uses free Google Speech Recognition for transcription + Qwen-Max for clinical analysis.
"""

import json
import tempfile
import os
import speech_recognition as sr
from pydub import AudioSegment
from fastapi import APIRouter, UploadFile, File, Form
from app.shared.qwen_client import call_qwen_max
from app.shared.multilingual import get_response_language_instruction, validate_language

router = APIRouter()

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

# Map language codes to Google Speech Recognition language codes
SPEECH_LANG_MAP = {
    "en": "en-US",
    "fr": "fr-FR",
    "ar": "ar-SA",
    "vi": "vi-VN",
    "vn": "vi-VN",
    "auto": "en-US",  # default fallback
}


def convert_to_wav(audio_bytes: bytes, original_format: str) -> str:
    """Convert any audio format to WAV for speech recognition."""
    with tempfile.NamedTemporaryFile(suffix=f".{original_format}", delete=False) as tmp_in:
        tmp_in.write(audio_bytes)
        tmp_in_path = tmp_in.name

    tmp_out_path = tmp_in_path.rsplit(".", 1)[0] + ".wav"

    try:
        audio = AudioSegment.from_file(tmp_in_path)
        audio = audio.set_channels(1).set_frame_rate(16000)
        audio.export(tmp_out_path, format="wav")
    except Exception as e:
        # If pydub fails, try using raw file
        tmp_out_path = tmp_in_path

    # Clean up input file
    if os.path.exists(tmp_in_path) and tmp_in_path != tmp_out_path:
        os.unlink(tmp_in_path)

    return tmp_out_path


def transcribe_audio_file(wav_path: str, language: str = "en-US") -> str:
    """Transcribe audio using Google Speech Recognition (free)."""
    recognizer = sr.Recognizer()

    # Split long audio into chunks (Google has ~60s limit)
    audio = AudioSegment.from_wav(wav_path)
    chunk_length_ms = 55000  # 55 seconds per chunk
    chunks = [audio[i:i + chunk_length_ms] for i in range(0, len(audio), chunk_length_ms)]

    full_transcript = []

    for i, chunk in enumerate(chunks):
        # Export chunk to temp file
        chunk_path = wav_path.rsplit(".", 1)[0] + f"_chunk{i}.wav"
        chunk.export(chunk_path, format="wav")

        try:
            with sr.AudioFile(chunk_path) as source:
                audio_data = recognizer.record(source)
                text = recognizer.recognize_google(audio_data, language=language)
                full_transcript.append(text)
        except sr.UnknownValueError:
            full_transcript.append("[inaudible]")
        except sr.RequestError as e:
            full_transcript.append(f"[transcription error: {e}]")
        finally:
            if os.path.exists(chunk_path):
                os.unlink(chunk_path)

    return " ".join(full_transcript)


AUDIO_FORMAT_MAP = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
}


@router.post("/transcribe")
async def transcribe_consultation(
    audio: UploadFile = File(...),
    language: str = Form("auto"),
):
    language = validate_language(language)
    audio_bytes = await audio.read()

    file_format = AUDIO_FORMAT_MAP.get(audio.content_type, "mp3")
    speech_lang = SPEECH_LANG_MAP.get(language, "en-US")

    # Step 1 — Convert to WAV and transcribe with Google (free)
    wav_path = convert_to_wav(audio_bytes, file_format)

    try:
        transcript = transcribe_audio_file(wav_path, speech_lang)
    finally:
        if os.path.exists(wav_path):
            os.unlink(wav_path)

    if not transcript or transcript.strip() == "[inaudible]":
        return {
            "language_detected": language,
            "transcript": "Could not transcribe audio. Please check the recording quality.",
            "clinical_report": None,
            "soap_note": None,
        }

    # Step 2 — Generate clinical report with Qwen-Max
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

    return {
        "language_detected": language,
        "transcript": transcript,
        **report,
    }