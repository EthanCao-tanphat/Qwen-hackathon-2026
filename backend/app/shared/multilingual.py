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
