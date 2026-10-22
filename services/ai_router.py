import os
import logging
from services.gemini_service import GeminiService
from services.groq_service import GroqService

logger = logging.getLogger("AIRouter")

class AIRouter:
    @staticmethod
    def generate(prompt: str, provider: str = None) -> str:
        active_provider = (provider or os.getenv("AI_PROVIDER", "auto")).lower()

        if active_provider == "groq":
            return GroqService.generate(prompt)
        elif active_provider == "gemini":
            return GeminiService.generate(prompt)

        # AUTO MODE: Gemini Primary -> Groq Fallback
        has_gemini = bool(os.getenv("GEMINI_API_KEY"))
        has_groq = bool(os.getenv("GROQ_API_KEY"))

        if not has_gemini and has_groq:
            return GroqService.generate(prompt)

        try:
            return GeminiService.generate(prompt)
        except Exception as e:
            if has_groq:
                logger.warning(f"Primary provider (Gemini) failed: {e}. Falling back to Groq.")
                return GroqService.generate(prompt)
            raise e
