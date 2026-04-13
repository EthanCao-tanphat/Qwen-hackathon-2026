"""
Qwen API client — wraps Alibaba Cloud DashScope for VL, Audio, and Max models.
"""

import os
import base64
import httpx
from dotenv import load_dotenv

load_dotenv()

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

HEADERS = {
    "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
    "Content-Type": "application/json",
}

# Model identifiers
MODEL_VL = "qwen-vl-max"
MODEL_AUDIO = "qwen-audio-turbo"
MODEL_MAX = "qwen-max"


async def _call(model: str, messages: list, temperature: float = 0.3, max_tokens: int = 4096) -> str:
    """Generic DashScope chat completion call."""
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(BASE_URL, headers=HEADERS, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]


async def call_qwen_max(system_prompt: str, user_prompt: str, **kwargs) -> str:
    """Call Qwen-Max for text-only reasoning."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return await _call(MODEL_MAX, messages, **kwargs)


async def call_qwen_vl(system_prompt: str, user_text: str, images_b64: list[str], **kwargs) -> str:
    """Call Qwen-VL with one or more base64 images."""
    content = []
    for img in images_b64:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{img}"},
        })
    content.append({"type": "text", "text": user_text})

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content},
    ]
    return await _call(MODEL_VL, messages, **kwargs)


async def call_qwen_audio(system_prompt: str, audio_b64: str, file_format: str = "wav", **kwargs) -> str:
    """Call Qwen-Audio with base64 audio."""
    content = [
        {"type": "audio_url", "audio_url": {"url": f"data:audio/{file_format};base64,{audio_b64}"}},
        {"type": "text", "text": "Transcribe this audio."},
    ]
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content},
    ]
    return await _call(MODEL_AUDIO, messages, **kwargs)


def encode_file_b64(file_bytes: bytes) -> str:
    """Encode raw bytes to base64 string."""
    return base64.b64encode(file_bytes).decode("utf-8")
