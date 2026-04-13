"""
Labs Analyzer — extract and explain lab results from PDF reports.
"""

import json
from fastapi import APIRouter, UploadFile, File, Form
from app.shared.qwen_client import call_qwen_vl, call_qwen_max, encode_file_b64
from app.shared.multilingual import get_response_language_instruction, validate_language

router = APIRouter()

EXTRACT_SYSTEM = """You are a medical lab report parser. Given images of a lab report PDF,
extract EVERY test result into a JSON array. For each test return:
{
  "test_name": "string",
  "value": "string",
  "unit": "string",
  "reference_range": "string"
}
Return ONLY valid JSON — an array of objects, nothing else."""

ANALYZE_SYSTEM_TEMPLATE = """You are a compassionate medical AI assistant.
Given a list of lab test results (JSON), for EACH test:
1. Classify status: normal | borderline | low | high | critical
2. Assign severity: normal | mild | moderate | severe | critical
3. Write a plain-language explanation (8th-grade reading level, no jargon)
4. Suggest 1-2 concrete next steps

Also produce:
- "summary": a 3-4 sentence overall patient-friendly summary
- "urgent_flags": array of test names needing immediate attention
- "total_tests_found": int
- "abnormal_count": int

{lang_instruction}

Return valid JSON matching this schema:
{{
  "results": [ {{ "test_name", "value", "unit", "reference_range", "status", "severity", "explanation", "next_steps": [] }} ],
  "summary": "string",
  "urgent_flags": [],
  "total_tests_found": int,
  "abnormal_count": int
}}"""


@router.post("/analyze")
async def analyze_lab_report(
    file: UploadFile = File(...),
    language: str = Form("auto"),
):
    language = validate_language(language)
    pdf_bytes = await file.read()

    import fitz
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images_b64 = []
    for page in doc:
        pix = page.get_pixmap(dpi=200)
        images_b64.append(encode_file_b64(pix.tobytes("png")))
    doc.close()

    raw_extraction = await call_qwen_vl(
        system_prompt=EXTRACT_SYSTEM,
        user_text="Extract every lab test result from this report.",
        images_b64=images_b64,
    )

    lang_instruction = get_response_language_instruction(language)
    analyze_system = ANALYZE_SYSTEM_TEMPLATE.format(lang_instruction=lang_instruction)

    analysis_raw = await call_qwen_max(
        system_prompt=analyze_system,
        user_prompt=f"Lab test results:\n{raw_extraction}",
    )

    try:
        cleaned = analysis_raw.strip().removeprefix("```json").removesuffix("```").strip()
        analysis = json.loads(cleaned)
    except json.JSONDecodeError:
        analysis = {"raw_response": analysis_raw, "parse_error": True}

    return {"language_detected": language, **analysis}
