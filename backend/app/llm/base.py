from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseLLM(ABC):
    """Abstract base for all LLM providers."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> str:
        """Send a chat request and return the response text."""
        ...

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """
        Async generator that yields text chunks.
        Default implementation yields the full result as a single chunk —
        safe fallback for providers that don't implement real streaming.
        """
        result = await self.chat(messages, temperature=temperature, max_tokens=max_tokens)
        yield result

    @abstractmethod
    async def list_models(self) -> list[str]:
        """Return list of available model names for this provider."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...
