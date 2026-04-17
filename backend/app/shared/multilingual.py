"""
Shared multilingual layer — language detection and localized prompt templates.
"""

SUPPORTED_LANGUAGES = {"en", "fr", "ar", "vn", "auto"}

LANGUAGE_NAMES = {
    "en": "English",
    "fr": "French",
    "ar": "Arabic",
    "vn": "Vietnamese",
}


def get_response_language_instruction(language: str) -> str:
    """Return a prompt instruction telling the model which language to respond in."""
    if language == "auto" or language not in LANGUAGE_NAMES:
        return "Detect the language of the input and respond in the SAME language."
    return f"Respond entirely in {LANGUAGE_NAMES[language]}."


def validate_language(language: str) -> str:
    """Normalize and validate the language code."""
    lang = language.strip().lower()
    return lang if lang in SUPPORTED_LANGUAGES else "auto"

def translate_text(text: str, source: str = "auto", target: str = "en") -> str:
    """Translate text using Google Translate (free, via deep-translator)."""
    if not text or not text.strip():
        return text
    try:
        from deep_translator import GoogleTranslator
        # Normalize our codes to Google codes
        source_code = "vi" if source in ("vn", "vi") else source
        target_code = "vi" if target in ("vn", "vi") else target
        if source_code == target_code:
            return text
        return GoogleTranslator(source=source_code, target=target_code).translate(text)
    except Exception as e:
        print(f"⚠️  Translation failed: {e}")
        return text  # fallback — return original text