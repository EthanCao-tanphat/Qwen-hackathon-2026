"""
Clinical Scribe — transcribe consultation audio and generate SOAP notes.
Uses Qwen ASR (async API) for transcription + diarization + Qwen-Max for clinical analysis.

Privacy flow:
  1. Audio uploaded to Cloudinary (temporary URL for Qwen to access)
  2. Qwen downloads + transcribes + diarizes speakers
  3. Cloudinary file is IMMEDIATELY deleted after transcription
  4. Transcript is processed in memory and returned
  5. Nothing is persisted on our backend
"""

import json
import asyncio
import os
import httpx
from fastapi import APIRouter, UploadFile, File, Form
from app.shared.qwen_client import call_qwen_max
from app.shared.multilingual import get_response_language_instruction, validate_language
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY")
BASE_URL = "https://dashscope-intl.aliyuncs.com"

CLINICAL_SYSTEM_TEMPLATE = """Clinical scribe. Identify speakers by context (Doctor: diagnoses/prescribes/examines, Patient: reports symptoms/answers).

{lang_instruction}

Return JSON only, no extra text:
{{
  "summary": "2-3 sentence plain language summary of the consultation",
  "patient_summary": "Plain language explanation for the patient of what was discussed and what they should do next — practical, clear, avoid medical jargon",
  "severity_level": "routine or urgent or emergency — based on clinical findings",
  "clinical_report": {{
    "patient_info": {{
      "name": null,
      "age": null,
      "date_of_birth": null,
      "gender": null
    }},
    "subjective": {{
      "chief_complaint": "string",
      "history_of_present_illness": "string",
      "past_medical_history": "string",
      "review_of_systems": {{
        "general": null,
        "respiratory": null,
        "cardiovascular": null,
        "gastrointestinal": null,
        "musculoskeletal": null,
        "neurological": null,
        "other": null
      }}
    }},
    "objective": {{
      "vital_signs": {{
        "temperature": null,
        "blood_pressure": null,
        "heart_rate": null,
        "respiratory_rate": null,
        "oxygen_saturation": null
      }},
      "general_appearance": null,
      "physical_examination": {{
        "heent": null,
        "neck": null,
        "cardiovascular": null,
        "respiratory": null,
        "other": null
      }},
      "diagnostic_tests": null
    }},
    "assessment": {{
      "primary_diagnosis": "string",
      "differential_diagnoses": ["string"],
      "justification": "string"
    }},
    "plan": {{
      "medications": [{{"name":"string","dosage":"string","frequency":"string","duration":"string"}}],
      "lifestyle_modifications": "string",
      "follow_up": "string",
      "referrals": null
    }}
  }},
  "soap_note": "SUBJECTIVE:
    Chief Complaint: [cc]
    History of Present Illness: [hpi]
    Past Medical History: [pmh]
    Review of Systems: [ros]

    OBJECTIVE:
    Vital Signs: T [temp] | BP [bp] | HR [hr] | RR [rr] | SpO2 [spo2]
    General Appearance: [appearance]
    Physical Examination: [pe]
    Diagnostic Tests: [tests]

    ASSESSMENT:
    Primary Diagnosis: [dx]
    Differential Diagnoses: [ddx]
    Justification: [justification]

    PLAN:
    Medications: [meds]
    Lifestyle Modifications: [lifestyle]
    Follow-Up: [followup]
    Referrals: [referrals]"
    }}
    Generate the soap_note field following EXACTLY this template structure.
    Replace [...] with actual content from transcript.
    Write 'Not reported' if information not mentioned.
    Null if entire section not applicable."""


def denoise_audio(audio_bytes: bytes) -> bytes:
    """Reduce background noise in audio. Optional — silently skipped if libs missing."""
    import noisereduce as nr
    import soundfile as sf
    import numpy as np
    import io

    audio_io = io.BytesIO(audio_bytes)
    data, rate = sf.read(audio_io)
    reduced = nr.reduce_noise(y=data, sr=rate)
    output_io = io.BytesIO()
    sf.write(output_io, reduced, rate, format="mp3")
    return output_io.getvalue()


async def upload_audio(audio_bytes: bytes, filename: str) -> tuple[str, str]:
    """
    Upload audio to Cloudinary temporarily.
    Returns (secure_url, public_id) — public_id needed for deletion.
    """
    import uuid
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    )

    public_id = f"healix/{uuid.uuid4()}"
    result = cloudinary.uploader.upload(
        audio_bytes,
        resource_type="video",
        public_id=public_id,
        format="mp3",
        audio_codec="mp3",
        audio_frequency=16000,
    )

    return result["secure_url"], result["public_id"]


def delete_cloudinary_file(public_id: str) -> None:
    """Delete audio from Cloudinary after we're done with it. Silent on failure."""
    try:
        import cloudinary
        import cloudinary.uploader
        cloudinary.uploader.destroy(public_id, resource_type="video")
    except Exception as e:
        # Non-critical — log but don't break the response
        print(f"⚠️  Failed to delete Cloudinary file {public_id}: {e}")


async def format_transcript(raw_transcript: str) -> str:
    """Post-process transcript to clean up speaker turns."""
    words = raw_transcript.split()
    chunk_size = 800
    chunks = [' '.join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size)]

    formatted_chunks = []
    for i, chunk in enumerate(chunks):
        response = await call_qwen_max(
            system_prompt="""You are a medical transcript formatter.
Given a raw consultation transcript, reformat it by:
Each input line may contain speech from BOTH Doctor and Patient mixed together.
Your job is to:
1. SPLIT each line into individual speaker turns based on meaning
2. Assign each turn to Doctor or Patient:
   - Doctor: asks about symptoms, examines, diagnoses, prescribes
   - Patient: greets doctor, describes symptoms, answers questions
   - CRITICAL: If someone addresses "Dr. [name]" → that is the Patient speaking
   - CRITICAL: NEVER skip any speech — every word must appear in output
   - These rules apply regardless of language
3. Add proper line breaks between each speaker turn
4. Capitalize first letter of each line
5. Return ONLY the formatted transcript, no extra text

Format strictly as:
Doctor: [words]
Patient: [words]
Doctor: [words]
...""",
            user_prompt=chunk,
            max_tokens=2000,
            temperature=0,
        )
        formatted_chunks.append(response)
    return '\n'.join(formatted_chunks)


async def transcribe_with_qwen(audio_url: str) -> dict:
    """Submit audio URL to Qwen ASR, poll until done, return transcript + language."""
    async with httpx.AsyncClient(timeout=60) as client:
        submit_res = await client.post(
            f"{BASE_URL}/api/v1/services/audio/asr/transcription",
            headers={
                "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
            json={
                "model": "qwen3-asr-flash-filetrans",
                "input": {"file_url": audio_url},
                "parameters": {
                    "language_hints": ["en", "vi", "fr", "ar"],
                    "disfluency": False,
                    "speaker_count": 2,
                    "diarization": True,
                },
            },
        )
        task_id = submit_res.json()["output"]["task_id"]

    while True:
        async with httpx.AsyncClient(timeout=300) as client:
            poll_res = await client.get(
                f"{BASE_URL}/api/v1/tasks/{task_id}",
                headers={"Authorization": f"Bearer {DASHSCOPE_API_KEY}"},
            )
            poll_data = poll_res.json()
            status = poll_data["output"]["task_status"]

            if status == "SUCCEEDED":
                transcript_res = await client.get(
                    poll_data["output"]["result"]["transcription_url"]
                )
                transcript_data = transcript_res.json()
                sentences = transcript_data["transcripts"][0]["sentences"]

                def smooth_speakers(sentences):
                    """Smooth out single-sentence speaker flips (likely misclassifications)."""
                    for i in range(1, len(sentences) - 1):
                        prev_speaker = sentences[i-1].get("speaker_id", 0)
                        curr_speaker = sentences[i].get("speaker_id", 0)
                        next_speaker = sentences[i+1].get("speaker_id", 0)

                        if prev_speaker == next_speaker and curr_speaker != prev_speaker:
                            sentences[i]["speaker_id"] = prev_speaker
                    return sentences

                sentences = smooth_speakers(sentences)
                language = sentences[0].get("language", "en")
                formatted = "\n".join([
                    f"{'Doctor' if s.get('speaker_id', 0) == 0 else 'Patient'}: {s['text']}"
                    for s in sentences
                ])
                return {
                    "transcript": formatted,
                    "language_detected": language,
                }

            if status == "FAILED":
                error_msg = poll_data["output"].get("message", "Unknown error")
                raise Exception(f"Transcription failed: {error_msg}")

        await asyncio.sleep(3)


@router.post("/transcribe")
async def transcribe_consultation(
    audio: UploadFile = File(...),
    language: str = Form("auto"),
):
    public_id = None  # track for cleanup in finally

    try:
        language = validate_language(language)
        audio_bytes = await audio.read()

        # Step 1 — Denoise (optional)
        try:
            audio_bytes = denoise_audio(audio_bytes)
        except Exception:
            pass  # silently skip if libs missing or audio format unsupported

        # Step 2 — Upload to Cloudinary (temporary)
        audio_url, public_id = await upload_audio(audio_bytes, audio.filename or "audio.mp3")

        # Step 3 — Transcribe via Qwen ASR
        transcription = await transcribe_with_qwen(audio_url)
        transcript = transcription["transcript"]
        language_detected = transcription["language_detected"]

        # Step 4 — DELETE from Cloudinary immediately after transcription
        # This is the privacy-preserving step: audio exists on Cloudinary for ~30-90s max
        delete_cloudinary_file(public_id)
        public_id = None  # prevent double-delete in finally block

        # Step 5 — Clean up transcript formatting (speaker turns)
        transcript = await format_transcript(transcript)

        # Step 6 — Translate if user requested a specific language
        if language != "auto" and language != language_detected:
            from app.shared.multilingual import translate_text
            transcript = translate_text(transcript, source=language_detected, target=language)

        if not transcript:
            return {
                "language_detected": language,
                "transcript": "Could not transcribe audio.",
                "clinical_report": None,
                "soap_note": None,
            }

        # Step 7 — Generate clinical report via Qwen-Max
        if language == "auto":
            lang_instruction = "Respond in the same language as the transcript."
        else:
            lang_names = {"en": "English", "fr": "French", "ar": "Arabic", "vi": "Vietnamese", "vn": "Vietnamese"}
            lang_name = lang_names.get(language, "English")
            lang_instruction = f"IMPORTANT: You MUST write ALL fields in {lang_name} only. The transcript may be in a different language but your output must be entirely in {lang_name}."

        clinical_system = CLINICAL_SYSTEM_TEMPLATE.format(
            lang_instruction=lang_instruction
        )

        report_raw = await call_qwen_max(
            system_prompt=clinical_system,
            user_prompt=f"Consultation transcript:\n\n{transcript}",
            max_tokens=8000,
        )

        try:
            cleaned = report_raw.strip().removeprefix("```json").removesuffix("```").strip()
            report = json.loads(cleaned, strict=False)
            if "soap_note" in report and report["soap_note"]:
                report["soap_note"] = report["soap_note"].replace("\\n", "\n")
        except json.JSONDecodeError:
            report = {"raw_response": report_raw, "parse_error": True}

        return {
            "language_detected": language_detected,
            "transcript": transcript,
            **report,
        }

    except Exception as e:
        return {
            "language_detected": language,
            "transcript": None,
            "clinical_report": None,
            "soap_note": None,
            "error": str(e),
        }

    finally:
        # Safety net — delete Cloudinary file even if transcription failed midway
        if public_id:
            delete_cloudinary_file(public_id)