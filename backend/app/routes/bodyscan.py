"""
Body Scan v2 — comprehensive body measurement, composition, and posture analysis.
Replaces Bodygram SDK with Qwen-VL + calibration pipeline.
"""

import json
import math
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.shared.qwen_client import call_qwen_vl, call_qwen_max, encode_file_b64
from app.shared.multilingual import get_response_language_instruction, validate_language

router = APIRouter()

# ────────────────────────────────────────────────────────────────
# System prompts
# ────────────────────────────────────────────────────────────────

CALIBRATION_SYSTEM = """You are a calibration detection AI.
The user may have placed a reference object in the photo for scale calibration.
Common reference objects: credit card (85.6mm × 53.98mm), A4 paper (297mm × 210mm),
smartphone, ruler, or standard water bottle.

Analyze the image and determine:
1. Is a reference object visible? (true/false)
2. What is the object? (type)
3. Estimated pixels-per-cm ratio based on the known real-world dimensions of the object
4. Confidence score (0-1)

Return ONLY valid JSON:
{
  "reference_detected": bool,
  "object_type": "string or null",
  "pixels_per_cm": float or null,
  "confidence": float
}"""

MEASURE_SYSTEM = """You are an advanced body measurement estimation AI trained on anthropometric data.
Given front and/or side body photos plus the person's height in cm, estimate ALL of the following
circumference and length measurements in centimeters.

CIRCUMFERENCE measurements (around the body):
- neck_cm, shoulder_cm, chest_cm, upper_chest_cm, bust_cm
- upper_arm_left_cm, upper_arm_right_cm, forearm_cm
- waist_cm, abdomen_cm, hip_cm
- thigh_left_cm, thigh_right_cm, knee_cm
- calf_left_cm, calf_right_cm, ankle_cm
- wrist_cm

LENGTH measurements (distances):
- shoulder_width_cm (shoulder to shoulder, straight line)
- arm_length_cm (shoulder to wrist)
- inseam_cm (crotch to ankle)
- torso_length_cm (shoulder to waist)
- total_leg_length_cm (hip to ankle)

Use the known height as a primary reference scale.
If a calibration_pixels_per_cm value is provided, use it to cross-validate your estimates.
If both front and side images are provided, use the front for width-based measurements
and the side for depth-based measurements. Combine both using an elliptical model
for circumference: C ≈ π × √(2 × (a² + b²)) where a=width/2, b=depth/2.

For measurements you cannot confidently estimate, provide your best estimate
and set its confidence below 0.5.

Return ONLY valid JSON:
{
  "measurements": {
    "neck_cm": {"value": float, "confidence": float},
    "shoulder_cm": {"value": float, "confidence": float},
    ...
  },
  "image_quality": {
    "front_usable": bool,
    "side_usable": bool,
    "lighting_score": float,
    "pose_score": float
  }
}"""

POSTURE_SYSTEM = """You are a posture analysis AI.
Given front and/or side body photos, analyze the person's posture and identify:

1. Head position (forward head posture, tilted, neutral)
2. Shoulder alignment (level, elevated left/right, rounded forward)
3. Spine curvature (normal, kyphosis, lordosis, scoliosis indicators)
4. Hip alignment (level, tilted)
5. Knee alignment (neutral, valgus/knock-knee, varus/bow-legged)
6. Overall posture score (1-10, 10 being perfect)

Return ONLY valid JSON:
{
  "posture": {
    "head": {"position": "string", "severity": "none|mild|moderate|severe"},
    "shoulders": {"alignment": "string", "severity": "none|mild|moderate|severe"},
    "spine": {"curvature": "string", "severity": "none|mild|moderate|severe"},
    "hips": {"alignment": "string", "severity": "none|mild|moderate|severe"},
    "knees": {"alignment": "string", "severity": "none|mild|moderate|severe"},
    "overall_score": float,
    "summary": "string"
  }
}"""

HEALTH_INSIGHT_SYSTEM = """You are a health insight AI.
Given a person's body measurements, body composition data, posture analysis, and basic info
(age, gender, height, weight), generate comprehensive health insights.

{lang_instruction}

Provide:
1. Body composition assessment with health risk indicators
2. Waist-to-hip ratio analysis and cardiovascular risk level
3. Body shape classification (apple, pear, hourglass, rectangle, inverted triangle)
4. Posture-related health recommendations
5. Fitness recommendations based on body type
6. Comparison to healthy ranges for their age/gender demographic
7. 3-5 actionable health improvement suggestions

Be encouraging but honest. Use plain language (8th-grade reading level).

Return valid JSON:
{{
  "health_insights": {{
    "body_shape": "string",
    "cardiovascular_risk": "low|moderate|high",
    "waist_hip_analysis": "string",
    "composition_assessment": "string",
    "posture_recommendations": ["string"],
    "fitness_recommendations": ["string"],
    "health_suggestions": ["string"],
    "summary": "string"
  }}
}}"""


# ────────────────────────────────────────────────────────────────
# Body composition calculations
# ────────────────────────────────────────────────────────────────

def navy_body_fat(waist_cm: float, neck_cm: float, hip_cm: float,
                  height_cm: float, gender: str) -> float:
    """U.S. Navy Method body fat percentage."""
    try:
        if gender == "male":
            bf = (86.010 * math.log10(waist_cm - neck_cm)
                  - 70.041 * math.log10(height_cm) + 36.76)
        else:
            bf = (163.205 * math.log10(waist_cm + hip_cm - neck_cm)
                  - 97.684 * math.log10(height_cm) - 78.387)
        return round(max(bf, 2.0), 1)
    except (ValueError, ZeroDivisionError):
        return 0.0


def bmi_calc(weight_kg: float, height_cm: float) -> float:
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 1)


def waist_hip_ratio(waist_cm: float, hip_cm: float) -> float:
    if hip_cm == 0:
        return 0.0
    return round(waist_cm / hip_cm, 3)


def whr_risk(whr: float, gender: str) -> str:
    if gender == "male":
        if whr < 0.90:
            return "low"
        elif whr < 0.95:
            return "moderate"
        return "high"
    else:
        if whr < 0.80:
            return "low"
        elif whr < 0.85:
            return "moderate"
        return "high"


def fat_category(bf_pct: float, gender: str) -> str:
    if gender == "male":
        if bf_pct < 6: return "Essential Fat"
        if bf_pct < 14: return "Athletes"
        if bf_pct < 18: return "Fitness"
        if bf_pct < 25: return "Average"
        return "Obese"
    else:
        if bf_pct < 14: return "Essential Fat"
        if bf_pct < 21: return "Athletes"
        if bf_pct < 25: return "Fitness"
        if bf_pct < 32: return "Average"
        return "Obese"


def bmr_calc(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """Mifflin-St Jeor BMR."""
    if gender == "male":
        return round(10 * weight_kg + 6.25 * height_cm - 5 * age + 5, 0)
    else:
        return round(10 * weight_kg + 6.25 * height_cm - 5 * age - 161, 0)


def _parse_json(raw: str, fallback: dict) -> dict:
    """Safely parse JSON from Qwen responses."""
    try:
        cleaned = raw.strip()
        # Strip markdown fences
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()
        return json.loads(cleaned)
    except (json.JSONDecodeError, IndexError):
        return fallback


# ────────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_body(
    front_image: UploadFile = File(...),
    side_image: UploadFile = File(None),
    height_cm: float = Form(...),
    weight_kg: float = Form(...),
    gender: str = Form("male"),
    age: int = Form(25),
    language: str = Form("auto"),
    has_reference_object: bool = Form(False),
):
    language = validate_language(language)

    # ── Encode images ────────────────────────────────────────
    front_bytes = await front_image.read()
    front_b64 = encode_file_b64(front_bytes)
    images_b64 = [front_b64]

    side_b64 = None
    if side_image:
        side_bytes = await side_image.read()
        side_b64 = encode_file_b64(side_bytes)
        images_b64.append(side_b64)

    # ── Step 1: Calibration (optional) ───────────────────────
    calibration = {"reference_detected": False, "pixels_per_cm": None, "confidence": 0}
    if has_reference_object:
        cal_raw = await call_qwen_vl(
            system_prompt=CALIBRATION_SYSTEM,
            user_text="Detect and measure the reference object in this image for scale calibration.",
            images_b64=[front_b64],
        )
        calibration = _parse_json(cal_raw, calibration)

    # ── Step 2: Comprehensive measurements with Qwen-VL ─────
    cal_note = ""
    if calibration.get("pixels_per_cm"):
        cal_note = f"\nCalibration: {calibration['pixels_per_cm']:.2f} pixels/cm detected from {calibration.get('object_type', 'reference object')}."

    measure_raw = await call_qwen_vl(
        system_prompt=MEASURE_SYSTEM,
        user_text=(
            f"Person's height is {height_cm} cm, weight {weight_kg} kg, "
            f"gender {gender}, age {age}.{cal_note}\n"
            f"{'Front and side images provided.' if side_b64 else 'Front image only.'}\n"
            f"Estimate all body measurements."
        ),
        images_b64=images_b64,
    )

    measure_data = _parse_json(measure_raw, {"measurements": {}, "image_quality": {}})

    # Extract flat measurement values
    raw_measurements = measure_data.get("measurements", {})
    measurements = {}
    confidences = {}
    for key, val in raw_measurements.items():
        if isinstance(val, dict):
            measurements[key] = val.get("value", 0)
            confidences[key] = val.get("confidence", 0.5)
        else:
            measurements[key] = val
            confidences[key] = 0.5

    image_quality = measure_data.get("image_quality", {})

    # ── Step 3: Posture analysis ─────────────────────────────
    posture_raw = await call_qwen_vl(
        system_prompt=POSTURE_SYSTEM,
        user_text="Analyze this person's posture from the provided images.",
        images_b64=images_b64,
    )
    posture_data = _parse_json(posture_raw, {"posture": {}})

    # ── Step 4: Body composition calculations ────────────────
    waist = measurements.get("waist_cm", 80)
    neck = measurements.get("neck_cm", 35)
    hip = measurements.get("hip_cm", 95)

    bf_pct = navy_body_fat(waist, neck, hip, height_cm, gender)
    bmi = bmi_calc(weight_kg, height_cm)
    lean_mass = round(weight_kg * (1 - bf_pct / 100), 1)
    fat_mass = round(weight_kg * bf_pct / 100, 1)
    whr = waist_hip_ratio(waist, hip)
    bmr = bmr_calc(weight_kg, height_cm, age, gender)

    body_composition = {
        "body_fat_pct": bf_pct,
        "category": fat_category(bf_pct, gender),
        "bmi": bmi,
        "bmi_category": (
            "Underweight" if bmi < 18.5 else
            "Normal" if bmi < 25 else
            "Overweight" if bmi < 30 else "Obese"
        ),
        "lean_mass_kg": lean_mass,
        "fat_mass_kg": fat_mass,
        "waist_hip_ratio": whr,
        "whr_risk": whr_risk(whr, gender),
        "bmr_kcal": bmr,
    }

    # ── Step 5: AI health insights via Qwen-Max ─────────────
    lang_instruction = get_response_language_instruction(language)
    insight_system = HEALTH_INSIGHT_SYSTEM.format(lang_instruction=lang_instruction)

    insight_prompt = (
        f"Patient profile: {gender}, age {age}, height {height_cm}cm, weight {weight_kg}kg\n"
        f"Body composition: {json.dumps(body_composition)}\n"
        f"Measurements: {json.dumps(measurements)}\n"
        f"Posture: {json.dumps(posture_data.get('posture', {}))}\n"
        f"Provide comprehensive health insights."
    )

    insight_raw = await call_qwen_max(
        system_prompt=insight_system,
        user_prompt=insight_prompt,
    )
    insight_data = _parse_json(insight_raw, {"health_insights": {"summary": insight_raw}})

    # ── Build response ───────────────────────────────────────
    return {
        "measurements": measurements,
        "measurement_confidence": confidences,
        "body_composition": body_composition,
        "posture": posture_data.get("posture", {}),
        "health_insights": insight_data.get("health_insights", {}),
        "calibration": calibration,
        "image_quality": image_quality,
        "metadata": {
            "measurements_count": len(measurements),
            "has_side_image": side_b64 is not None,
            "calibration_used": calibration.get("reference_detected", False),
        },
    }


@router.post("/evaluate-photo")
async def evaluate_photo(
    image: UploadFile = File(...),
    photo_type: str = Form("front"),  # "front" or "side"
):
    """
    Best Shot endpoint — evaluates photo quality before full analysis.
    Returns positioning feedback so the client can guide the user.
    """
    image_bytes = await image.read()
    image_b64 = encode_file_b64(image_bytes)

    EVAL_SYSTEM = f"""You are a body scan photo quality evaluator.
The user is trying to take a {photo_type}-view body photo for measurement analysis.

Evaluate the image on these criteria:
1. Full body visible (head to feet)? 
2. Proper distance (not too close, not too far — ideally 2-3 meters)
3. Good lighting (not backlit, not too dark, even illumination)
4. Neutral pose achieved (arms slightly away from body, feet shoulder-width apart for front; 
   arms relaxed at sides, profile clearly visible for side)
5. Camera level (not tilted, roughly at waist height)
6. Minimal clutter/clear background
7. Person is centered in frame
8. Clothing is not too loose (tight or form-fitting is better for accuracy)

For each criterion, score 0-1 and provide a brief fix instruction if score < 0.7.
Also provide an overall "ready" boolean — true only if ALL criteria score >= 0.6.

Return ONLY valid JSON:
{{
  "ready": bool,
  "overall_score": float,
  "criteria": {{
    "full_body_visible": {{"score": float, "fix": "string or null"}},
    "proper_distance": {{"score": float, "fix": "string or null"}},
    "lighting": {{"score": float, "fix": "string or null"}},
    "pose": {{"score": float, "fix": "string or null"}},
    "camera_level": {{"score": float, "fix": "string or null"}},
    "clear_background": {{"score": float, "fix": "string or null"}},
    "centered": {{"score": float, "fix": "string or null"}},
    "clothing_fit": {{"score": float, "fix": "string or null"}}
  }},
  "suggestion": "One-line overall instruction for the user"
}}"""

    eval_raw = await call_qwen_vl(
        system_prompt=EVAL_SYSTEM,
        user_text=f"Evaluate this {photo_type}-view body photo for measurement accuracy.",
        images_b64=[image_b64],
    )

    result = _parse_json(eval_raw, {
        "ready": False,
        "overall_score": 0,
        "criteria": {},
        "suggestion": "Could not evaluate the photo. Please try again.",
    })

    return result
