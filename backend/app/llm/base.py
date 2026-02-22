from abc import ABC, abstractmethod


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

    @abstractmethod
    async def list_models(self) -> list[str]:
        """Return list of available model names for this provider."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...
