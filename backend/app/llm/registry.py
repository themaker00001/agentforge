"""
LLM Registry — resolves "provider:model" strings to LLM instances.
Examples:
  get_llm("ollama:llama3")       → OllamaLLM("llama3")
  get_llm("openai:gpt-4o")       → OpenAILLM("gpt-4o")
  get_llm("gemini:gemini-1.5-pro") → GeminiLLM("gemini-1.5-pro")
"""

from .base import BaseLLM
from .ollama import OllamaLLM
from .openai import OpenAILLM
from .gemini import GeminiLLM


def get_llm(model_string: str) -> BaseLLM:
    """Parse 'provider:model' and return the appropriate LLM instance."""
    if ":" in model_string:
        provider, model = model_string.split(":", 1)
    else:
        provider, model = "ollama", model_string

    provider = provider.lower()
    if provider == "ollama":
        return OllamaLLM(model)
    elif provider == "openai":
        return OpenAILLM(model)
    elif provider in ("gemini", "google"):
        return GeminiLLM(model)
    else:
        # Default to Ollama
        return OllamaLLM(model)


async def get_all_models() -> dict[str, list[str]]:
    """Fetch available models from all providers concurrently."""
    import asyncio
    ollama = OllamaLLM()
    openai_llm = OpenAILLM()
    gemini_llm = GeminiLLM()

    ollama_models, openai_models, gemini_models = await asyncio.gather(
        ollama.list_models(),
        openai_llm.list_models(),
        gemini_llm.list_models(),
        return_exceptions=True,
    )

    return {
        "ollama": ollama_models if isinstance(ollama_models, list) else [],
        "openai": openai_models if isinstance(openai_models, list) else ["gpt-4o"],
        "gemini": gemini_models if isinstance(gemini_models, list) else ["gemini-1.5-pro"],
    }
