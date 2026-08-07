"""Provider-aware chat model registry for DocWise."""

from typing import Literal, TypedDict

from core.config import settings

ChatProvider = Literal["cerebras", "openrouter"]

CEREBRAS_CONTEXT_WINDOW_TOKENS = 65536
OPENROUTER_TENCENT_CONTEXT_WINDOW_TOKENS = 262144
DEFAULT_OUTPUT_RESERVE_TOKENS = 4096
LARGE_OUTPUT_RESERVE_TOKENS = 8192

#: Effort levels the picker offers. Order matters — the UI renders it as-is.
REASONING_EFFORTS: tuple[str, ...] = ("low", "medium", "high")
DEFAULT_REASONING_EFFORT = "medium"


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
    toolCalling: bool
    #: Effort levels this model actually honours. Empty means the model can
    #: think but has no dial, so we must not send an `effort` the API rejects.
    reasoningEfforts: list[str]


def normalize_reasoning_effort(value: str | None) -> str | None:
    """Return a supported effort level, or None when the value is unusable."""
    if not value:
        return None
    candidate = value.strip().lower()
    return candidate if candidate in REASONING_EFFORTS else None


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
            "fallbackModelId": "tencent/hy3",
            "toolCalling": True,
            "reasoningEfforts": list(REASONING_EFFORTS),
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
            "toolCalling": True,
            "reasoningEfforts": list(REASONING_EFFORTS),
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
            "toolCalling": True,
            "reasoningEfforts": list(REASONING_EFFORTS),
        },
        {
            # `tencent/hy3:free` was a 404 — OpenRouter has no free variant of
            # this model, so every fallback from gpt-oss-120b was dead.
            "id": "tencent/hy3",
            "name": "Tencent HY3",
            "description": "OpenRouter general-purpose model for document chat.",
            "model": "tencent/hy3",
            "provider": "openrouter",
            "providerLabel": "OpenRouter",
            "reasoning_effort": DEFAULT_REASONING_EFFORT,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": None,
            "contextWindow": OPENROUTER_TENCENT_CONTEXT_WINDOW_TOKENS,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "gpt-oss-120b",
            "toolCalling": True,
            "reasoningEfforts": list(REASONING_EFFORTS),
        },
        {
            "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
            "name": "Nemotron 3 Ultra",
            "description": "Frontier reasoning and orchestration with a 1M-token window.",
            "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
            "provider": "openrouter",
            "providerLabel": "OpenRouter",
            "reasoning_effort": DEFAULT_REASONING_EFFORT,
            "creditCost": deep_cost,
            "reasoning": False,
            "badge": "Frontier",
            "contextWindow": 1_000_000,
            "outputReserveTokens": LARGE_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "nvidia/nemotron-3-super-120b-a12b:free",
            "toolCalling": True,
            "reasoningEfforts": list(REASONING_EFFORTS),
        },
        {
            "id": "nvidia/nemotron-3-super-120b-a12b:free",
            "name": "Nemotron 3 Super",
            "description": "Long-context planning and cross-document reasoning.",
            "model": "nvidia/nemotron-3-super-120b-a12b:free",
            "provider": "openrouter",
            "providerLabel": "OpenRouter",
            "reasoning_effort": DEFAULT_REASONING_EFFORT,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Free",
            "contextWindow": 262_144,
            "outputReserveTokens": LARGE_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "gpt-oss-120b",
            "toolCalling": True,
            "reasoningEfforts": list(REASONING_EFFORTS),
        },
        {
            "id": "nvidia/nemotron-3-nano-30b-a3b:free",
            "name": "Nemotron 3 Nano",
            "description": "Small, quick model for everyday document questions.",
            "model": "nvidia/nemotron-3-nano-30b-a3b:free",
            "provider": "openrouter",
            "providerLabel": "OpenRouter",
            "reasoning_effort": None,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Free",
            "contextWindow": 256_000,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "gpt-oss-120b",
            "toolCalling": True,
            # Thinks, but exposes no effort dial.
            "reasoningEfforts": [],
        },
        {
            "id": "poolside/laguna-s-2.1:free",
            "name": "Laguna S 2.1",
            "description": "Coding-agent model for code-heavy documents and repos.",
            "model": "poolside/laguna-s-2.1:free",
            "provider": "openrouter",
            "providerLabel": "OpenRouter",
            "reasoning_effort": None,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Code",
            "contextWindow": 262_144,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "cohere/north-mini-code:free",
            "toolCalling": True,
            "reasoningEfforts": [],
        },
        {
            "id": "cohere/north-mini-code:free",
            "name": "North Mini Code",
            "description": "Low-latency agentic coding model with interleaved tool use.",
            "model": "cohere/north-mini-code:free",
            "provider": "openrouter",
            "providerLabel": "OpenRouter",
            "reasoning_effort": None,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Code",
            "contextWindow": 256_000,
            "outputReserveTokens": DEFAULT_OUTPUT_RESERVE_TOKENS,
            "fallbackModelId": "gpt-oss-120b",
            "toolCalling": True,
            "reasoningEfforts": [],
        },
    ]


def resolve_chat_model(
    model_id: str | None,
    deep_mode: bool,
    reasoning_effort: str | None = None,
) -> ChatModel | None:
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

        # An explicit request wins, but only if this model has a dial at all —
        # sending `effort` to a model without one is rejected by the provider.
        requested = normalize_reasoning_effort(reasoning_effort)
        if not resolved["reasoningEfforts"]:
            resolved["reasoning_effort"] = None
        elif requested and requested in resolved["reasoningEfforts"]:
            resolved["reasoning_effort"] = requested
        elif resolved["provider"] == "cerebras":
            resolved["reasoning_effort"] = settings.CEREBRAS_DEEP_REASONING_EFFORT
        elif resolved["reasoning_effort"] is None:
            resolved["reasoning_effort"] = DEFAULT_REASONING_EFFORT
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
        "toolCalling": model["toolCalling"],
        "agentToolsEnabled": settings.AGENT_TOOLS_ENABLED,
        # search_web/inspect_web_source are only registered when Tavily is
        # configured. Without this the UI offers Agent mode and the web tools
        # silently never fire, which reads as a broken agent rather than a
        # missing key.
        "webSearchEnabled": bool(settings.TAVILY_API_KEY),
        "reasoningEfforts": model["reasoningEfforts"],
    }


def fallback_chat_model(
    model: ChatModel,
    deep_mode: bool,
    *,
    require_tools: bool = False,
) -> ChatModel | None:
    """Return a configured compatible fallback, if its provider is usable."""
    fallback_id = model.get("fallbackModelId")
    if not fallback_id:
        return None
    # Carry the effort across so a fallback doesn't silently drop to default.
    fallback = resolve_chat_model(fallback_id, deep_mode, model.get("reasoning_effort"))
    if fallback is None:
        return None
    if require_tools and not fallback["toolCalling"]:
        return None
    if fallback["provider"] == "openrouter" and not settings.OPENROUTER_API_KEY:
        return None
    if fallback["provider"] == "cerebras" and not settings.CEREBRAS_API_KEY:
        return None
    return fallback
