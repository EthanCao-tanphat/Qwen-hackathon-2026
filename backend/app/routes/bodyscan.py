"""
Body Scan — estimate body measurements and body fat from photos.
"""

import json
import math
from fastapi import APIRouter, UploadFile, File, Form
from app.shared.qwen_client import call_qwen_vl, call_qwen_max, encode_file_b64
from app.shared.multilingual import validate_language

router = APIRouter()

MEASURE_SYSTEM = """You are a body measurement estimation AI.
Given front and/or side body photos plus the person's height in cm,
estimate the following circumference measurements in centimeters:
neck_cm, shoulder_cm, upper_chest_cm, upper_arm_cm, waist_cm, hip_cm, thigh_cm, calf_cm.

Use the known height as a reference scale.
Return ONLY valid JSON: { "neck_cm": float, "shoulder_cm": float, ... }"""


def navy_body_fat(waist_cm: float, neck_cm: float, hip_cm: float, height_cm: float, gender: str) -> float:
    """U.S. Navy Method body fat percentage calculation."""
    if gender == "male":
        bf = 86.010 * math.log10(waist_cm - neck_cm) - 70.041 * math.log10(height_cm) + 36.76
    else:
        bf = 163.205 * math.log10(waist_cm + hip_cm - neck_cm) - 97.684 * math.log10(height_cm) - 78.387
    return round(max(bf, 2.0), 1)


def bmi_calc(weight_kg: float, height_cm: float) -> float:
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 1)


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


@router.post("/analyze")
async def analyze_body(
    front_image: UploadFile = File(...),
    side_image: UploadFile = File(None),
    height_cm: float = Form(...),
    weight_kg: float = Form(...),
    gender: str = Form("male"),
    age: int = Form(25),
):
    # Encode images
    front_bytes = await front_image.read()
    images_b64 = [encode_file_b64(front_bytes)]

    if side_image:
        side_bytes = await side_image.read()
        images_b64.append(encode_file_b64(side_bytes))

    # Step 1 — Estimate measurements with Qwen-VL
    measure_raw = await call_qwen_vl(
        system_prompt=MEASURE_SYSTEM,
        user_text=f"Person's height is {height_cm} cm. Estimate body circumference measurements.",
        images_b64=images_b64,
    )

    try:
        cleaned = measure_raw.strip().removeprefix("```json").removesuffix("```").strip()
        measurements = json.loads(cleaned)
    except json.JSONDecodeError:
        measurements = {
            "neck_cm": 0, "shoulder_cm": 0, "upper_chest_cm": 0,
            "upper_arm_cm": 0, "waist_cm": 0, "hip_cm": 0,
            "thigh_cm": 0, "calf_cm": 0,
        }

    # Step 2 — Calculate body composition
    waist = measurements.get("waist_cm", 85)
    neck = measurements.get("neck_cm", 35)
    hip = measurements.get("hip_cm", 95)

    bf_pct = navy_body_fat(waist, neck, hip, height_cm, gender)
    bmi = bmi_calc(weight_kg, height_cm)
    lean_mass = round(weight_kg * (1 - bf_pct / 100), 1)
    fat_mass = round(weight_kg * bf_pct / 100, 1)

    return {
        "measurements": measurements,
        "body_composition": {
            "body_fat_pct": bf_pct,
            "category": fat_category(bf_pct, gender),
            "bmi": bmi,
            "lean_mass_kg": lean_mass,
            "fat_mass_kg": fat_mass,
        },
    }
