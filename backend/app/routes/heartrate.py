"""
Heart Rate Scan — estimate heart rate from fingertip video using PPG (photoplethysmography).

How it works:
1. Client captures ~15-30 seconds of video with finger over camera + flash ON
2. Client extracts frames (or sends raw video) to this endpoint
3. Backend analyzes red channel intensity variation across frames
4. Peak detection on the PPG signal yields heart rate in BPM

Two modes:
  - /analyze-frames : client sends pre-extracted frame images (lighter, works from web)
  - /analyze-video  : client sends raw video file (heavier, more accurate)
"""

import json
import math
import struct
from io import BytesIO
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.shared.qwen_client import call_qwen_vl, call_qwen_max, encode_file_b64

router = APIRouter()


# ────────────────────────────────────────────────────────────────
# Pure Python PPG signal processing (no numpy/scipy dependency)
# ────────────────────────────────────────────────────────────────

def _extract_red_channel_from_frames(frame_bytes_list: list[bytes]) -> list[float]:
    """
    Extract average red channel intensity from each JPEG/PNG frame.
    Uses PIL if available, falls back to Qwen-VL for estimation.
    """
    try:
        from PIL import Image
        red_values = []
        for fb in frame_bytes_list:
            img = Image.open(BytesIO(fb)).convert("RGB")
            pixels = list(img.getdata())
            avg_red = sum(p[0] for p in pixels) / len(pixels)
            red_values.append(avg_red)
        return red_values
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Pillow is required for PPG frame analysis."
        )


def _bandpass_filter(signal: list[float], fps: float,
                     low_hz: float = 0.7, high_hz: float = 3.5) -> list[float]:
    """
    Simple moving-average bandpass filter for PPG signal.
    Removes DC component and high-frequency noise.
    low_hz=0.7 (42 BPM) to high_hz=3.5 (210 BPM) covers normal HR range.
    """
    n = len(signal)
    if n < 4:
        return signal

    # Remove DC component (subtract rolling mean)
    window = max(int(fps / low_hz), 3)
    dc_removed = []
    for i in range(n):
        start = max(0, i - window // 2)
        end = min(n, i + window // 2 + 1)
        local_mean = sum(signal[start:end]) / (end - start)
        dc_removed.append(signal[i] - local_mean)

    # Smooth high-frequency noise (simple moving average)
    smooth_window = max(int(fps / high_hz / 2), 1)
    smoothed = []
    for i in range(n):
        start = max(0, i - smooth_window)
        end = min(n, i + smooth_window + 1)
        smoothed.append(sum(dc_removed[start:end]) / (end - start))

    return smoothed


def _find_peaks(signal: list[float], min_distance: int = 5) -> list[int]:
    """Simple peak detection — finds local maxima."""
    peaks = []
    n = len(signal)
    for i in range(1, n - 1):
        if signal[i] > signal[i - 1] and signal[i] > signal[i + 1]:
            if not peaks or (i - peaks[-1]) >= min_distance:
                peaks.append(i)
    return peaks


def _calculate_bpm(peaks: list[int], fps: float) -> dict:
    """Calculate BPM and HRV metrics from peak positions."""
    if len(peaks) < 2:
        return {"bpm": 0, "confidence": 0, "hrv_ms": 0}

    # Inter-beat intervals in seconds
    intervals = [(peaks[i + 1] - peaks[i]) / fps for i in range(len(peaks) - 1)]

    # Remove outliers (intervals outside 0.3s–1.5s range = 40–200 BPM)
    valid_intervals = [iv for iv in intervals if 0.3 <= iv <= 1.5]

    if not valid_intervals:
        return {"bpm": 0, "confidence": 0, "hrv_ms": 0}

    mean_interval = sum(valid_intervals) / len(valid_intervals)
    bpm = round(60.0 / mean_interval, 1)

    # HRV (SDNN) — standard deviation of NN intervals
    if len(valid_intervals) > 1:
        mean_iv = sum(valid_intervals) / len(valid_intervals)
        variance = sum((iv - mean_iv) ** 2 for iv in valid_intervals) / (len(valid_intervals) - 1)
        hrv_ms = round(math.sqrt(variance) * 1000, 1)
    else:
        hrv_ms = 0

    # Confidence based on signal consistency
    consistency = len(valid_intervals) / max(len(intervals), 1)
    confidence = round(min(consistency, 1.0), 2)

    return {
        "bpm": bpm,
        "confidence": confidence,
        "hrv_ms": hrv_ms,
        "beats_detected": len(peaks),
        "valid_intervals": len(valid_intervals),
    }


def _classify_heart_rate(bpm: float, age: int) -> dict:
    """Classify heart rate with health context."""
    if bpm == 0:
        return {"zone": "unknown", "description": "Could not determine heart rate."}

    # Resting heart rate zones
    if bpm < 60:
        zone = "bradycardia"
        desc = "Below normal resting range. Common in athletes; consult a doctor if you feel dizzy or faint."
    elif bpm <= 100:
        zone = "normal"
        if bpm <= 70:
            desc = "Excellent resting heart rate — indicates good cardiovascular fitness."
        elif bpm <= 80:
            desc = "Good resting heart rate — within healthy range."
        else:
            desc = "Normal but on the higher side. Regular cardio exercise can help lower it."
    else:
        zone = "tachycardia"
        desc = "Above normal resting range. If at rest and persistent, consider consulting a doctor."

    # Max HR estimate (Tanaka formula)
    max_hr = round(208 - 0.7 * age, 0)

    return {
        "zone": zone,
        "description": desc,
        "max_hr_estimate": max_hr,
        "hr_reserve": round(max_hr - bpm, 0) if bpm > 0 else 0,
        "pct_max_hr": round(bpm / max_hr * 100, 1) if max_hr > 0 else 0,
    }


# ────────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────────

@router.post("/analyze-frames")
async def analyze_heart_rate_frames(
    frames: list[UploadFile] = File(...),
    fps: float = Form(30.0),
    age: int = Form(25),
):
    """
    Analyze heart rate from pre-extracted video frames.
    Client should capture 15-30 seconds of fingertip-on-camera video,
    extract frames at known FPS, and send them here.
    
    Minimum ~10 seconds of frames needed for reliable reading.
    """
    if len(frames) < 10:
        raise HTTPException(
            status_code=400,
            detail="Need at least 10 frames. Capture 15-30 seconds of video."
        )

    # Read all frame bytes
    frame_bytes_list = []
    for f in frames:
        fb = await f.read()
        frame_bytes_list.append(fb)

    # Extract red channel averages
    red_signal = _extract_red_channel_from_frames(frame_bytes_list)

    # Filter the PPG signal
    filtered = _bandpass_filter(red_signal, fps)

    # Detect peaks
    min_dist = max(int(fps * 0.3), 3)  # Minimum 0.3s between beats
    peaks = _find_peaks(filtered, min_distance=min_dist)

    # Calculate BPM and metrics
    hr_result = _calculate_bpm(peaks, fps)
    classification = _classify_heart_rate(hr_result["bpm"], age)

    # Signal quality assessment
    signal_amplitude = max(filtered) - min(filtered) if filtered else 0
    signal_quality = "good" if signal_amplitude > 1.0 and hr_result["confidence"] > 0.7 else \
                     "fair" if signal_amplitude > 0.5 and hr_result["confidence"] > 0.4 else "poor"

    return {
        "heart_rate": {
            "bpm": hr_result["bpm"],
            "confidence": hr_result["confidence"],
            **classification,
        },
        "hrv": {
            "sdnn_ms": hr_result["hrv_ms"],
            "interpretation": (
                "Good variability — healthy autonomic function" if hr_result["hrv_ms"] > 50 else
                "Moderate variability" if hr_result["hrv_ms"] > 20 else
                "Low variability — may indicate stress or fatigue"
            ),
        },
        "signal_quality": signal_quality,
        "metadata": {
            "frames_analyzed": len(frame_bytes_list),
            "fps": fps,
            "duration_seconds": round(len(frame_bytes_list) / fps, 1),
            "beats_detected": hr_result.get("beats_detected", 0),
        },
    }


@router.post("/analyze-video")
async def analyze_heart_rate_video(
    video: UploadFile = File(...),
    age: int = Form(25),
):
    """
    Analyze heart rate from raw video file.
    Extracts frames server-side using ffmpeg or Pillow.
    Accepts MP4, MOV, WEBM.
    """
    video_bytes = await video.read()

    try:
        import subprocess
        import tempfile
        import os
        from PIL import Image

        # Write video to temp file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        # Get video info via ffprobe
        probe_cmd = [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", tmp_path
        ]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
        probe_data = json.loads(probe_result.stdout)

        # Find video stream FPS
        fps = 30.0
        for stream in probe_data.get("streams", []):
            if stream.get("codec_type") == "video":
                r_frame = stream.get("r_frame_rate", "30/1")
                num, den = r_frame.split("/")
                fps = float(num) / float(den)
                break

        # Extract frames via ffmpeg (1 frame every 1/fps seconds = all frames,
        # but we downsample to ~30fps max for efficiency)
        target_fps = min(fps, 30)
        frames_dir = tempfile.mkdtemp()
        extract_cmd = [
            "ffmpeg", "-i", tmp_path,
            "-vf", f"fps={target_fps}",
            "-f", "image2",
            f"{frames_dir}/frame_%05d.png",
            "-y", "-loglevel", "quiet"
        ]
        subprocess.run(extract_cmd, check=True)

        # Read extracted frames
        frame_files = sorted([
            f for f in os.listdir(frames_dir) if f.endswith(".png")
        ])

        frame_bytes_list = []
        for ff in frame_files:
            with open(os.path.join(frames_dir, ff), "rb") as fh:
                frame_bytes_list.append(fh.read())

        # Cleanup
        os.unlink(tmp_path)
        for ff in frame_files:
            os.unlink(os.path.join(frames_dir, ff))
        os.rmdir(frames_dir)

        if len(frame_bytes_list) < 10:
            raise HTTPException(
                status_code=400,
                detail=f"Video too short — only {len(frame_bytes_list)} frames extracted. Need at least 10 seconds."
            )

        # Process the same as frame-based analysis
        red_signal = _extract_red_channel_from_frames(frame_bytes_list)
        filtered = _bandpass_filter(red_signal, target_fps)
        min_dist = max(int(target_fps * 0.3), 3)
        peaks = _find_peaks(filtered, min_distance=min_dist)
        hr_result = _calculate_bpm(peaks, target_fps)
        classification = _classify_heart_rate(hr_result["bpm"], age)

        signal_amplitude = max(filtered) - min(filtered) if filtered else 0
        signal_quality = "good" if signal_amplitude > 1.0 and hr_result["confidence"] > 0.7 else \
                         "fair" if signal_amplitude > 0.5 and hr_result["confidence"] > 0.4 else "poor"

        return {
            "heart_rate": {
                "bpm": hr_result["bpm"],
                "confidence": hr_result["confidence"],
                **classification,
            },
            "hrv": {
                "sdnn_ms": hr_result["hrv_ms"],
                "interpretation": (
                    "Good variability — healthy autonomic function" if hr_result["hrv_ms"] > 50 else
                    "Moderate variability" if hr_result["hrv_ms"] > 20 else
                    "Low variability — may indicate stress or fatigue"
                ),
            },
            "signal_quality": signal_quality,
            "metadata": {
                "frames_analyzed": len(frame_bytes_list),
                "fps": target_fps,
                "duration_seconds": round(len(frame_bytes_list) / target_fps, 1),
                "beats_detected": hr_result.get("beats_detected", 0),
                "source": "video",
            },
        }

    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not available. Use /analyze-frames endpoint instead."
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process video: {str(e)}"
        )
