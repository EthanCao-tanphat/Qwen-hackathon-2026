"""
Shared multilingual layer — language detection + Google Translate (free).
Uses deep-translator (no API key needed).
"""

from deep_translator import GoogleTranslator

SUPPORTED_LANGUAGES = {"en", "fr", "ar", "vi", "auto"}

LANGUAGE_NAMES = {
    "en": "English",
    "fr": "French",
    "ar": "Arabic",
    "vi": "Vietnamese",
}

# Map our codes to Google Translate codes
LANG_MAP = {
    "en": "en",
    "fr": "fr",
    "ar": "ar",
    "vi": "vi",
    "vn": "vi",  # alias
}


def validate_language(language: str) -> str:
    """Normalize and validate the language code."""
    lang = language.strip().lower()
    if lang == "vn":
        lang = "vi"
    return lang if lang in SUPPORTED_LANGUAGES else "auto"


def get_response_language_instruction(language: str) -> str:
    """Prompt instruction telling the model which language to respond in."""
    if language == "auto" or language not in LANGUAGE_NAMES:
        return "Detect the language of the input and respond in the SAME language."
    return f"Respond entirely in {LANGUAGE_NAMES[language]}."


def translate_text(text: str, source: str = "auto", target: str = "en") -> str:
    """
    Translate text using Google Translate (free, no API key).
    
    Args:
        text: Text to translate
        source: Source language code ("auto" for auto-detect)
        target: Target language code
    
    Returns:
        Translated text
    """
    if not text or not text.strip():
        return text

    src = LANG_MAP.get(source, source)
    tgt = LANG_MAP.get(target, target)

    if src == tgt and src != "auto":
        return text

    try:
        # deep-translator has ~5000 char limit per call
        if len(text) <= 4500:
            return GoogleTranslator(source=src, target=tgt).translate(text)
        
        # Chunk long text by paragraphs
        chunks = _split_text(text, 4500)
        translated = []
        for chunk in chunks:
            result = GoogleTranslator(source=src, target=tgt).translate(chunk)
            translated.append(result)
        return "\n".join(translated)
    except Exception as e:
        print(f"[Healix] Translation error: {e}")
        return text


def translate_json_values(data, source: str = "auto", target: str = "en"):
    """Recursively translate all string values in a dict/list."""
    if isinstance(data, str):
        return translate_text(data, source, target)
    elif isinstance(data, dict):
        return {k: translate_json_values(v, source, target) for k, v in data.items()}
    elif isinstance(data, list):
        return [translate_json_values(item, source, target) for item in data]
    return data


def _split_text(text: str, max_len: int) -> list[str]:
    """Split text into chunks at paragraph boundaries."""
    paragraphs = text.split("\n")
    chunks = []
    current = ""
    for p in paragraphs:
        if len(current) + len(p) + 1 > max_len:
            if current:
                chunks.append(current)
            current = p
        else:
            current = current + "\n" + p if current else p
    if current:
        chunks.append(current)
    return chunks