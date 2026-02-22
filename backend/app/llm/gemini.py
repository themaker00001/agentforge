import os
from .base import BaseLLM

try:
    from google import genai
    from google.genai import types as genai_types
    _gemini_available = True
except ImportError:
    _gemini_available = False


class GeminiLLM(BaseLLM):
    def __init__(self, model: str = "gemini-3.0-flash"):
        self.model = model
        api_key = os.getenv("GEMINI_API_KEY", "")
        if _gemini_available and api_key:
            self._client = genai.Client(api_key=api_key)
        else:
            self._client = None

    @property
    def provider_name(self) -> str:
        return "gemini"

    async def list_models(self) -> list[str]:
        if not _gemini_available:
            return ["gemini-3.0-flash", "gemini-3.0-pro", "gemini-3.0-flash"]
        try:
            if not self._client:
                return ["gemini-3.0-flash", "gemini-3.0-pro", "gemini-3.0-flash"]
            models = self._client.models.list()
            return [m.name.split("/")[-1] for m in models if "generateContent" in (m.supported_actions or [])]
        except Exception:
            return ["gemini-3.0-flash", "gemini-3.0-pro", "gemini-3.0-flash"]

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> str:
        if not self._client:
            return "[Gemini] API key not configured. Set GEMINI_API_KEY env var."
        try:
            prompt = "\n".join(
                f"{m['role'].upper()}: {m['content']}" for m in messages
            )
            config = genai_types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            )
            resp = self._client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config,
            )
            return resp.text
        except Exception as e:
            return f"[Gemini error] {e}"
