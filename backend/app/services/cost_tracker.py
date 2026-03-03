"""
Cost Tracker — token estimation and pricing calculation.

Pricing table uses per-million-token rates (input, output).
Ollama models are $0 since they run locally.
"""

# (per_million_input_tokens, per_million_output_tokens)
PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o":              (5.0,  15.0),
    "gpt-4-turbo":         (10.0, 30.0),
    "gpt-4-vision-preview":(10.0, 30.0),
    "gpt-4":               (30.0, 60.0),
    "gpt-3.5-turbo":       (0.5,  1.5),
    "gemini-1.5-pro":      (3.5,  10.5),
    "gemini-1.5-flash":    (0.35, 1.05),
    "gemini-2.0-flash":    (0.10, 0.40),
    "gemini-2.5-pro":      (1.25, 10.0),
}


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def calc_cost(model_str: str, tokens_in: int, tokens_out: int) -> float:
    """
    Calculate USD cost for a model call.

    model_str can be prefixed (e.g. 'openai:gpt-4o', 'gemini:gemini-1.5-pro').
    Ollama models always return 0.0.
    """
    if not model_str:
        return 0.0

    lower = model_str.lower()

    # Ollama / LM Studio — free local inference
    if lower.startswith("ollama:") or lower.startswith("lmstudio:"):
        return 0.0

    # Strip provider prefix for lookup
    if ":" in lower:
        key_str = lower.split(":", 1)[1]
    else:
        key_str = lower

    # Find best matching pricing key (prefix match)
    price_in, price_out = 0.0, 0.0
    for model_key, (p_in, p_out) in PRICING.items():
        if key_str.startswith(model_key.lower()) or model_key.lower() in key_str:
            price_in, price_out = p_in, p_out
            break

    cost = (tokens_in * price_in + tokens_out * price_out) / 1_000_000
    return round(cost, 8)
