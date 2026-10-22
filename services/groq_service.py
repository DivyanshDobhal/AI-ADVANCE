import os
import time
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GroqService")

class GroqService:
    API_URL = "https://api.groq.com/openai/v1/chat/completions"
    DEFAULT_MODEL = "llama-3.3-70b-versatile"

    @classmethod
    def generate(cls, prompt: str, model: str = None) -> str:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is not configured on the server.")

        selected_model = model or os.getenv("GROQ_MODEL", cls.DEFAULT_MODEL)
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        payload = {
            "model": selected_model,
            "messages": [
                {"role": "system", "content": "You are the AI Software Compiler. Return strictly valid JSON with no markdown wrapping."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        t_start = time.time()
        response = requests.post(cls.API_URL, headers=headers, json=payload, timeout=45)
        elapsed_ms = int((time.time() - t_start) * 1000)

        if response.status_code != 200:
            raise RuntimeError(f"Groq API error HTTP {response.status_code}: {response.text[:300]}")

        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content.strip():
            raise ValueError("Groq returned empty completion.")

        logger.info(f"Groq completion succeeded ({selected_model}) in {elapsed_ms}ms")
        return content.strip()

    @classmethod
    def test_connection(cls, model: str = None) -> bool:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return False
        selected_model = model or os.getenv("GROQ_MODEL", cls.DEFAULT_MODEL)
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        payload = {
            "model": selected_model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 5
        }
        try:
            res = requests.post(cls.API_URL, headers=headers, json=payload, timeout=8)
            return res.status_code == 200
        except Exception:
            return False
