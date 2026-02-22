import os
from .base import BaseLLM

try:
    from openai import AsyncOpenAI
    _openai_available = True
except ImportError:
    _openai_available = False


class OpenAILLM(BaseLLM):
    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        api_key = os.getenv("OPENAI_API_KEY", "")
        self._client = AsyncOpenAI(api_key=api_key) if _openai_available and api_key else None

    @property
    def provider_name(self) -> str:
        return "openai"

    async def list_models(self) -> list[str]:
        if not self._client:
            return ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]
        try:
            models = await self._client.models.list()
            gpt = [m.id for m in models.data if m.id.startswith("gpt")]
            return sorted(gpt)
        except Exception:
            return ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> str:
        if not self._client:
            return "[OpenAI] API key not configured. Set OPENAI_API_KEY env var."
        try:
            resp = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            return f"[OpenAI error] {e}"
