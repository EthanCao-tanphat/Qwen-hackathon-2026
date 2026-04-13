"""
Labs Analyzer — clinically accurate lab report analysis.
Three-step pipeline:
  1. Qwen-VL: OCR extraction from PDF images
  2. Server-side: validate against medical reference ranges
  3. Qwen-Max: clinical interpretation + patient explanations
"""

import json
import re
from fastapi import APIRouter, UploadFile, File, Form
from app.shared.qwen_client import call_qwen_vl, call_qwen_max, encode_file_b64, compress_image_b64
from app.shared.multilingual import get_response_language_instruction, validate_language

router = APIRouter()

# ──────────────────────────────────────────────
# STEP 1: EXTRACTION PROMPT (Qwen-VL)
# ──────────────────────────────────────────────

EXTRACT_SYSTEM = """You are a medical laboratory report OCR specialist. You must extract ALL information with 100% accuracy.

From the lab report image(s), extract:

1. **Patient Information** (if visible):
   - name, age, gender, date_of_birth, patient_id, collection_date, report_date, lab_name, ordering_physician

2. **Every Single Test Result** — do NOT skip any test. For each test extract:
   - test_name: the exact test name as printed
   - value: the numeric or text result (exactly as shown)
   - unit: the unit of measurement (exactly as shown)
   - reference_range: the normal range printed on the report
   - flag: any flag shown (H, L, HH, LL, *, abnormal, etc.) or null if none

CRITICAL RULES:
- Extract ALL tests, even if they are on different pages
- Keep the EXACT values and units from the report — do NOT round or convert
- If reference range is shown as "13.5 - 17.5 g/dL", keep it exactly
- If a test has no reference range printed, set it to null
- Include panel headers (e.g., "Complete Blood Count", "Metabolic Panel") as a "panel" field
- For tests with multiple components (e.g., WBC differential), extract each sub-test

Return ONLY valid JSON, no markdown, no explanation:
{
  "patient_info": { "name": "...", "age": "...", "gender": "...", "collection_date": "...", "report_date": "...", "lab_name": "...", "patient_id": "..." },
  "tests": [
    {
      "panel": "Complete Blood Count",
      "test_name": "Hemoglobin",
      "value": "12.5",
      "unit": "g/dL",
      "reference_range": "13.5-17.5",
      "flag": "L"
    }
  ]
}"""

# ──────────────────────────────────────────────
# STEP 2: MEDICAL REFERENCE RANGES
# Standard adult ranges for validation
# ──────────────────────────────────────────────

REFERENCE_RANGES = {
    # Hematology
    "hemoglobin": {"male": (13.5, 17.5, "g/dL"), "female": (12.0, 16.0, "g/dL")},
    "hematocrit": {"male": (38.3, 48.6, "%"), "female": (35.5, 44.9, "%")},
    "rbc": {"male": (4.35, 5.65, "M/uL"), "female": (3.92, 5.13, "M/uL")},
    "wbc": {"both": (4.5, 11.0, "K/uL")},
    "platelets": {"both": (150, 400, "K/uL")},
    "mcv": {"both": (80, 100, "fL")},
    "mch": {"both": (27, 33, "pg")},
    "mchc": {"both": (32, 36, "g/dL")},
    "rdw": {"both": (11.5, 14.5, "%")},
    "mpv": {"both": (7.5, 12.5, "fL")},
    "neutrophils": {"both": (40, 70, "%")},
    "lymphocytes": {"both": (20, 40, "%")},
    "monocytes": {"both": (2, 8, "%")},
    "eosinophils": {"both": (1, 4, "%")},
    "basophils": {"both": (0, 1, "%")},
    # Metabolic Panel
    "glucose": {"both": (70, 100, "mg/dL")},
    "glucose fasting": {"both": (70, 100, "mg/dL")},
    "bun": {"both": (7, 20, "mg/dL")},
    "creatinine": {"male": (0.74, 1.35, "mg/dL"), "female": (0.59, 1.04, "mg/dL")},
    "sodium": {"both": (136, 145, "mEq/L")},
    "potassium": {"both": (3.5, 5.0, "mEq/L")},
    "chloride": {"both": (98, 106, "mEq/L")},
    "co2": {"both": (23, 29, "mEq/L")},
    "calcium": {"both": (8.5, 10.5, "mg/dL")},
    "total protein": {"both": (6.0, 8.3, "g/dL")},
    "albumin": {"both": (3.5, 5.5, "g/dL")},
    "bilirubin total": {"both": (0.1, 1.2, "mg/dL")},
    "bilirubin direct": {"both": (0.0, 0.3, "mg/dL")},
    # Liver
    "alt": {"both": (7, 56, "U/L")},
    "ast": {"both": (10, 40, "U/L")},
    "alp": {"both": (44, 147, "U/L")},
    "ggt": {"male": (9, 48, "U/L"), "female": (5, 36, "U/L")},
    # Lipids
    "total cholesterol": {"both": (0, 200, "mg/dL")},
    "ldl": {"both": (0, 100, "mg/dL")},
    "hdl": {"male": (40, 999, "mg/dL"), "female": (50, 999, "mg/dL")},
    "triglycerides": {"both": (0, 150, "mg/dL")},
    # Thyroid
    "tsh": {"both": (0.27, 4.20, "mIU/L")},
    "free t4": {"both": (0.93, 1.7, "ng/dL")},
    "free t3": {"both": (2.0, 4.4, "pg/mL")},
    # Diabetes
    "hba1c": {"both": (4.0, 5.6, "%")},
    # Kidney
    "egfr": {"both": (90, 999, "mL/min")},
    "uric acid": {"male": (3.4, 7.0, "mg/dL"), "female": (2.4, 6.0, "mg/dL")},
    # Iron
    "iron": {"both": (60, 170, "ug/dL")},
    "ferritin": {"male": (20, 250, "ng/mL"), "female": (10, 120, "ng/mL")},
    # Coagulation
    "pt": {"both": (11, 13.5, "seconds")},
    "inr": {"both": (0.8, 1.1, "")},
    # Inflammation
    "crp": {"both": (0, 3.0, "mg/L")},
    "esr": {"male": (0, 15, "mm/hr"), "female": (0, 20, "mm/hr")},
    # Urinalysis
    "ph urine": {"both": (4.5, 8.0, "")},
    "specific gravity": {"both": (1.005, 1.030, "")},
}

# Dangerous critical values that need immediate flagging
CRITICAL_VALUES = {
    "potassium": {"low": 2.5, "high": 6.5},
    "sodium": {"low": 120, "high": 160},
    "glucose": {"low": 40, "high": 500},
    "hemoglobin": {"low": 7.0, "high": 20.0},
    "platelets": {"low": 50, "high": 1000},
    "wbc": {"low": 2.0, "high": 30.0},
    "inr": {"high": 4.5},
    "creatinine": {"high": 10.0},
    "calcium": {"low": 6.0, "high": 13.0},
    "troponin": {"high": 0.04},
}


def normalize_test_name(name: str) -> str:
    """Normalize test name for matching."""
    name = name.lower().strip()
    name = re.sub(r'[,\.\(\)]', '', name)
    # Common aliases
    aliases = {
        "hgb": "hemoglobin", "hb": "hemoglobin",
        "hct": "hematocrit",
        "plt": "platelets", "platelet count": "platelets",
        "white blood cell": "wbc", "white blood cells": "wbc",
        "red blood cell": "rbc", "red blood cells": "rbc",
        "sgpt": "alt", "alanine aminotransferase": "alt",
        "sgot": "ast", "aspartate aminotransferase": "ast",
        "alkaline phosphatase": "alp",
        "blood urea nitrogen": "bun",
        "glycated hemoglobin": "hba1c", "hemoglobin a1c": "hba1c",
        "fasting glucose": "glucose fasting", "fasting blood sugar": "glucose fasting",
        "cholesterol total": "total cholesterol",
        "ldl cholesterol": "ldl", "ldl-c": "ldl",
        "hdl cholesterol": "hdl", "hdl-c": "hdl",
        "c-reactive protein": "crp", "c reactive protein": "crp",
        "erythrocyte sedimentation rate": "esr",
        "prothrombin time": "pt",
        "estimated gfr": "egfr", "egfr ckd-epi": "egfr",
        "thyroid stimulating hormone": "tsh",
    }
    return aliases.get(name, name)


def classify_severity(test_name: str, value_str: str, ref_range: str, gender: str = "both") -> dict:
    """
    Classify test result severity using medical reference ranges.
    Returns: { status, severity, deviation_pct, is_critical }
    """
    try:
        value = float(re.sub(r'[<>]', '', str(value_str)))
    except (ValueError, TypeError):
        return {"status": "unknown", "severity": "unknown", "deviation_pct": 0, "is_critical": False}

    norm_name = normalize_test_name(test_name)

    # Get reference range from our database, or parse from report
    low, high = None, None
    if norm_name in REFERENCE_RANGES:
        ranges = REFERENCE_RANGES[norm_name]
        key = gender if gender in ranges else "both"
        if key in ranges:
            low, high = ranges[key][0], ranges[key][1]
    
    # Try parsing from report's reference range string
    if low is None and ref_range:
        match = re.search(r'([\d.]+)\s*[-–]\s*([\d.]+)', str(ref_range))
        if match:
            low, high = float(match.group(1)), float(match.group(2))
    
    if low is None or high is None:
        return {"status": "unknown", "severity": "unknown", "deviation_pct": 0, "is_critical": False}

    # Check critical values first
    is_critical = False
    if norm_name in CRITICAL_VALUES:
        crit = CRITICAL_VALUES[norm_name]
        if "low" in crit and value <= crit["low"]:
            is_critical = True
        if "high" in crit and value >= crit["high"]:
            is_critical = True

    # Calculate deviation
    if value < low:
        deviation = ((low - value) / low) * 100
        if is_critical:
            return {"status": "critically low", "severity": "critical", "deviation_pct": round(deviation, 1), "is_critical": True}
        if deviation > 30:
            return {"status": "low", "severity": "severe", "deviation_pct": round(deviation, 1), "is_critical": False}
        if deviation > 15:
            return {"status": "low", "severity": "moderate", "deviation_pct": round(deviation, 1), "is_critical": False}
        if deviation > 5:
            return {"status": "low", "severity": "mild", "deviation_pct": round(deviation, 1), "is_critical": False}
        return {"status": "borderline low", "severity": "borderline", "deviation_pct": round(deviation, 1), "is_critical": False}
    
    elif value > high:
        deviation = ((value - high) / high) * 100
        if is_critical:
            return {"status": "critically high", "severity": "critical", "deviation_pct": round(deviation, 1), "is_critical": True}
        if deviation > 30:
            return {"status": "high", "severity": "severe", "deviation_pct": round(deviation, 1), "is_critical": False}
        if deviation > 15:
            return {"status": "high", "severity": "moderate", "deviation_pct": round(deviation, 1), "is_critical": False}
        if deviation > 5:
            return {"status": "high", "severity": "mild", "deviation_pct": round(deviation, 1), "is_critical": False}
        return {"status": "borderline high", "severity": "borderline", "deviation_pct": round(deviation, 1), "is_critical": False}
    
    else:
        return {"status": "normal", "severity": "normal", "deviation_pct": 0, "is_critical": False}


# Organ system classification
ORGAN_SYSTEMS = {
    "Hematology (Blood Cells)": ["hemoglobin", "hematocrit", "rbc", "wbc", "platelets", "mcv", "mch", "mchc", "rdw", "mpv", "neutrophils", "lymphocytes", "monocytes", "eosinophils", "basophils"],
    "Metabolic Panel": ["glucose", "glucose fasting", "bun", "creatinine", "sodium", "potassium", "chloride", "co2", "calcium"],
    "Liver Function": ["alt", "ast", "alp", "ggt", "bilirubin total", "bilirubin direct", "total protein", "albumin"],
    "Lipid Panel": ["total cholesterol", "ldl", "hdl", "triglycerides"],
    "Thyroid Function": ["tsh", "free t4", "free t3"],
    "Diabetes Markers": ["hba1c", "glucose", "glucose fasting"],
    "Kidney Function": ["creatinine", "bun", "egfr", "uric acid"],
    "Iron Studies": ["iron", "ferritin"],
    "Coagulation": ["pt", "inr"],
    "Inflammation": ["crp", "esr"],
}


def get_organ_system(test_name: str) -> str:
    norm = normalize_test_name(test_name)
    for system, tests in ORGAN_SYSTEMS.items():
        if norm in tests:
            return system
    return "Other Tests"


# ──────────────────────────────────────────────
# STEP 3: CLINICAL INTERPRETATION PROMPT (Qwen-Max)
# ──────────────────────────────────────────────

INTERPRET_SYSTEM_TEMPLATE = """You are a clinical laboratory medicine expert providing patient-friendly explanations.

You are given lab results with server-validated severity classifications. Your job is to:

1. For EACH test result, write:
   - "explanation": A 2-3 sentence plain-language explanation (8th-grade reading level). 
     Explain what this test measures, why this result matters for the patient's health, 
     and what body system it relates to. Do NOT use medical jargon without explaining it.
   - "next_steps": Array of 1-3 specific, actionable recommendations. 
     Be concrete (e.g., "Eat iron-rich foods like spinach, red meat, and lentils" NOT "Improve your diet").

2. Write a "summary" (4-5 sentences): Overall health picture. Start with reassuring normal results,
   then address abnormal findings. Mention organ systems affected. End with general recommendation.

3. Write "clinical_correlations": Array of strings noting any concerning PATTERNS across multiple tests.
   Examples: 
   - "Low hemoglobin + low MCV + low iron suggests iron-deficiency anemia"
   - "Elevated AST + ALT with normal ALP suggests hepatocellular pattern"
   - "High glucose + elevated HbA1c indicates poorly controlled diabetes"
   - "Low eGFR + high creatinine indicates reduced kidney function"

4. Write "priority_actions": Array of the top 3 most important things the patient should do,
   ordered by urgency.

{lang_instruction}

Return ONLY valid JSON:
{{
  "interpretations": [
    {{
      "test_name": "string",
      "explanation": "string",
      "next_steps": ["string"]
    }}
  ],
  "summary": "string",
  "clinical_correlations": ["string"],
  "priority_actions": ["string"]
}}"""


def clean_json(raw: str) -> str:
    """Strip markdown fences and clean JSON string."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)
    return raw.strip()


@router.post("/analyze")
async def analyze_lab_report(
    files: list[UploadFile] = File(...),
    language: str = Form("auto"),
    gender: str = Form("both"),
):
    language = validate_language(language)

    # ── STEP 1: Convert ALL input files to images for Qwen-VL ──
    images_b64 = []

    for file in files:
        file_bytes = await file.read()
        content_type = file.content_type or ""
        filename = (file.filename or "").lower()

        if "pdf" in content_type or filename.endswith(".pdf"):
            import fitz
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                pix = page.get_pixmap(dpi=150)  # Lower DPI = faster upload
                images_b64.append(compress_image_b64(pix.tobytes("png"), max_size=1400, quality=80))
            doc.close()
        else:
            images_b64.append(compress_image_b64(file_bytes, max_size=1400, quality=80))

    raw_extraction = await call_qwen_vl(
        system_prompt=EXTRACT_SYSTEM,
        user_text="Extract every single lab test result from this report. Do not skip any test. Return valid JSON only.",
        images_b64=images_b64,
    )

    # Parse extraction
    try:
        extracted = json.loads(clean_json(raw_extraction))
    except json.JSONDecodeError:
        return {
            "language_detected": language,
            "parse_error": True,
            "raw_extraction": raw_extraction,
            "results": [],
            "summary": "Could not parse lab report. Please try a clearer scan.",
        }

    patient_info = extracted.get("patient_info", {})
    tests = extracted.get("tests", [])

    # Handle case where AI returns flat array
    if isinstance(extracted, list):
        tests = extracted
        patient_info = {}

    # ── STEP 2: Server-side severity validation ──
    validated_results = []
    urgent_flags = []
    abnormal_count = 0
    system_groups = {}

    for test in tests:
        test_name = test.get("test_name", "Unknown")
        value = test.get("value", "")
        unit = test.get("unit", "")
        ref_range = test.get("reference_range", "")
        flag = test.get("flag", None)
        panel = test.get("panel", "")

        # Server-side severity classification
        severity_info = classify_severity(test_name, value, ref_range, gender)

        # Override with report's own flag if our detection says normal but report says abnormal
        if severity_info["status"] == "normal" and flag and flag.upper() in ("H", "HH", "L", "LL", "*"):
            if flag.upper() in ("H", "HH"):
                severity_info = {"status": "high", "severity": "mild", "deviation_pct": 0, "is_critical": False}
            elif flag.upper() in ("L", "LL"):
                severity_info = {"status": "low", "severity": "mild", "deviation_pct": 0, "is_critical": False}

        if severity_info["severity"] not in ("normal", "unknown"):
            abnormal_count += 1
        if severity_info["is_critical"]:
            urgent_flags.append(test_name)

        organ_system = get_organ_system(test_name)

        result = {
            "test_name": test_name,
            "value": value,
            "unit": unit,
            "reference_range": ref_range,
            "flag": flag,
            "panel": panel,
            "status": severity_info["status"],
            "severity": severity_info["severity"],
            "deviation_pct": severity_info["deviation_pct"],
            "is_critical": severity_info["is_critical"],
            "organ_system": organ_system,
        }
        validated_results.append(result)

        # Group by organ system
        if organ_system not in system_groups:
            system_groups[organ_system] = []
        system_groups[organ_system].append(result)

    # ── STEP 3: Clinical interpretation with Qwen-Max ──
    lang_instruction = get_response_language_instruction(language)
    interpret_system = INTERPRET_SYSTEM_TEMPLATE.format(lang_instruction=lang_instruction)

    # Build a clear prompt with validated results
    results_text = json.dumps(validated_results, indent=2, ensure_ascii=False)
    patient_context = ""
    if patient_info:
        patient_context = f"Patient: {patient_info.get('name', 'Unknown')}, "
        patient_context += f"Age: {patient_info.get('age', 'Unknown')}, "
        patient_context += f"Gender: {patient_info.get('gender', gender)}\n\n"

    interpret_raw = await call_qwen_max(
        system_prompt=interpret_system,
        user_prompt=f"{patient_context}Lab results with validated severity:\n{results_text}",
        temperature=0.2,  # Lower temperature for medical accuracy
    )

    try:
        interpretation = json.loads(clean_json(interpret_raw))
    except json.JSONDecodeError:
        interpretation = {
            "interpretations": [],
            "summary": interpret_raw[:500],
            "clinical_correlations": [],
            "priority_actions": [],
        }

    # Merge interpretation into results
    interp_map = {}
    for interp in interpretation.get("interpretations", []):
        interp_map[interp.get("test_name", "")] = interp

    for result in validated_results:
        interp = interp_map.get(result["test_name"], {})
        result["explanation"] = interp.get("explanation", "")
        result["next_steps"] = interp.get("next_steps", [])

    return {
        "language_detected": language,
        "patient_info": patient_info,
        "results": validated_results,
        "results_by_system": system_groups,
        "summary": interpretation.get("summary", ""),
        "clinical_correlations": interpretation.get("clinical_correlations", []),
        "priority_actions": interpretation.get("priority_actions", []),
        "urgent_flags": urgent_flags,
        "total_tests_found": len(validated_results),
        "abnormal_count": abnormal_count,
    }