"""Provider-aware chat model registry for DocWise."""

from typing import Literal, TypedDict

from core.config import settings

ChatProvider = Literal["cerebras", "openrouter"]

CEREBRAS_CONTEXT_WINDOW_TOKENS = 65536
OPENROUTER_TENCENT_CONTEXT_WINDOW_TOKENS = 262144
DEFAULT_OUTPUT_RESERVE_TOKENS = 4096


class ChatModel(TypedDict):
    id: str
    name: str
    description: str
    model: str
    provider: ChatProvider
    providerLabel: str
    reasoning_effort: str | None
    creditCost: int
    reasoning: bool
    badge: str | None
    contextWindow: int
    outputReserveTokens: int
    fallbackModelId: str | None


def available_chat_models() -> list[ChatModel]:
    """Return all chat models exposed to the picker, including provider metadata."""
    fast_cost = max(1, settings.CHAT_FAST_CREDIT_COST)
    deep_cost = max(fast_cost + 1, settings.CHAT_DEEP_CREDIT_COST)
    cerebras_reasoning = settings.CEREBRAS_CHAT_REASONING_EFFORT or settings.CEREBRAS_REASONING_EFFORT

    return [
        {
            "id": "gpt-oss-120b",
            "name": "GPT OSS 120B",
            "description": "Fast Q&A for everyday questions.",
            "model": "gpt-oss-120b",
            "provider": "cerebras",
            "providerLabel": "Cerebras",
            "reasoning_effort": cerebras_reasoning,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Fast",
            "contextWindow": CEREBRAS_CONTEXT_WINDOW_TOKENS,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "tencent/hy3:free",
        },
        {
            "id": "gemma-4-31b",
            "name": "Gemma 4 31B",
            "description": "Balanced model for richer prompts and files.",
            "model": "gemma-4-31b",
            "provider": "cerebras",
            "providerLabel": "Cerebras",
            "reasoning_effort": cerebras_reasoning,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Docs",
            "contextWindow": CEREBRAS_CONTEXT_WINDOW_TOKENS,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "gpt-oss-120b",
        },
        {
            "id": "zai-glm-4.7",
            "name": "GLM 4.7",
            "description": "Higher-capacity model for complex reasoning.",
            "model": "zai-glm-4.7",
            "provider": "cerebras",
            "providerLabel": "Cerebras",
            "reasoning_effort": cerebras_reasoning,
            "creditCost": deep_cost,
            "reasoning": False,
            "badge": "Heavy",
            "contextWindow": CEREBRAS_CONTEXT_WINDOW_TOKENS,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "gpt-oss-120b",
        },
        {
            "id": "tencent/hy3:free",
            "name": "Tencent HY3",
            "description": "OpenRouter free model for general and document chat.",
            "model": "tencent/hy3:free",
            "provider": "openrouter",
            "providerLabel": "OpenRouter",
            "reasoning_effort": "medium",
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Free",
            "contextWindow": OPENROUTER_TENCENT_CONTEXT_WINDOW_TOKENS,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "gpt-oss-120b",
        },
    ]


def resolve_chat_model(model_id: str | None, deep_mode: bool) -> ChatModel | None:
    """Resolve a requested model id to a concrete provider-aware model profile."""
    models = available_chat_models()
    fallback_id = settings.CEREBRAS_DEEP_MODEL if deep_mode else settings.CEREBRAS_CHAT_MODEL
    selected_id = model_id or fallback_id
    selected = next((model for model in models if model["id"] == selected_id or model["model"] == selected_id), None)
    if selected is None:
        return None

    resolved: ChatModel = {**selected}
    if deep_mode:
        resolved["reasoning"] = True
        resolved["creditCost"] += max(1, settings.CHAT_DEEP_CREDIT_COST)
        if resolved["provider"] == "cerebras":
            resolved["reasoning_effort"] = settings.CEREBRAS_DEEP_REASONING_EFFORT
        elif resolved["reasoning_effort"] is None:
            resolved["reasoning_effort"] = "medium"
    return resolved


def public_chat_model(model: ChatModel) -> dict[str, object]:
    """Return the public model metadata shape consumed by the frontend."""
    return {
        "id": model["id"],
        "name": model["name"],
        "description": model["description"],
        "creditCost": model["creditCost"],
        "reasoning": model["reasoning"],
        "badge": model["badge"],
        "provider": model["provider"],
        "providerLabel": model["providerLabel"],
        "contextWindow": model["contextWindow"],
        "outputReserveTokens": model["outputReserveTokens"],
    }


def fallback_chat_model(model: ChatModel, deep_mode: bool) -> ChatModel | None:
    """Return a configured compatible fallback, if its provider is usable."""
    fallback_id = model.get("fallbackModelId")
    if not fallback_id:
        return None
    fallback = resolve_chat_model(fallback_id, deep_mode)
    if fallback is None:
        return None
    if fallback["provider"] == "openrouter" and not settings.OPENROUTER_API_KEY:
        return None
    if fallback["provider"] == "cerebras" and not settings.CEREBRAS_API_KEY:
        return None
    return fallback
