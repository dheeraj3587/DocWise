"use client";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleGauge,
  ExternalLinkIcon,
  LightbulbIcon,
  Loader2,
  MessageCircle,
  MessageSquare,
  PaperclipIcon,
  SearchIcon,
  Send,
  RotateCcwIcon,
  SquareIcon,
  X,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import {
  Dispatch,
  type KeyboardEvent,
  SetStateAction,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import {
  ModelGlyph,
  ModelSelector,
  type ModelOption,
  type ReasoningEffort,
} from "@/components/docwise/model-selector";
import { StatusBadge } from "@/components/docwise/status-badge";
import { FileUpload } from "@/app/(dashboard)/components/file-upload";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { getApiBase } from "@/lib/api-base";
import {
  chatApi,
  type ChatCitation,
  type ChatUsage,
  type ConversationMessageRecord,
  type ToolInvocationRecord,
} from "@/lib/chat-api";
import { normalizeMathDelimiters } from "@/lib/markdown-math";
import { readSSE } from "@/lib/sse";
import { cn } from "@/lib/utils";

// Memoize plugin arrays to avoid recreating on every render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REMARK_PLUGINS: any = [remarkGfm, remarkMath];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REHYPE_PLUGINS: any = [rehypeKatex];

const THINK_CREDIT_SURCHARGE = 3;
const AGENT_CREDIT_SURCHARGE = 2;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: boolean;
  agentMode?: boolean;
  agentIterations?: number;
  toolCallCount?: number;
  toolInvocations?: ToolInvocationRecord[];
  status?: "streaming" | "complete" | "failed" | "cancelled";
  citations?: ChatCitation[];
  usage?: ChatUsage;
  provider?: string | null;
  modelId?: string | null;
  fallbackUsed?: boolean;
  error?: { code: string; detail: string } | null;
}

interface ChatPanelProps {
  embedded?: boolean;
  compact?: boolean;
  layout?: "default" | "full";
  fileId?: string;
  documentIds?: string[];
  title?: string;
  subtitle?: string;
  placeholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  hideHeader?: boolean;
  allowGeneralChat?: boolean;
  topBarStart?: ReactNode;
  messages?: ChatMessage[];
  setMessages?: Dispatch<SetStateAction<ChatMessage[]>>;
  conversationId?: string;
  onConversationIdChange?: (conversationId: string) => void;
  onConversationUpdated?: () => void;
  onCitationNavigate?: (citation: ChatCitation) => void;
}

const FALLBACK_CHAT_MODELS: ModelOption[] = [
  {
    id: "gpt-oss-120b",
    name: "GPT OSS 120B",
    description: "Fast Q&A for everyday questions.",
    creditCost: 1,
    reasoning: false,
    provider: "cerebras",
    providerLabel: "Cerebras",
    badge: "Fast",
    contextWindow: 65536,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: ["low", "medium", "high"],
  },
  {
    id: "gemma-4-31b",
    name: "Gemma 4 31B",
    description: "Balanced model for richer prompts and files.",
    creditCost: 1,
    reasoning: false,
    provider: "cerebras",
    providerLabel: "Cerebras",
    badge: "Docs",
    contextWindow: 65536,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: ["low", "medium", "high"],
  },
  {
    id: "zai-glm-4.7",
    name: "GLM 4.7",
    description: "Higher-capacity model for complex reasoning.",
    creditCost: 3,
    reasoning: false,
    provider: "cerebras",
    providerLabel: "Cerebras",
    badge: "Heavy",
    contextWindow: 65536,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: ["low", "medium", "high"],
  },
  {
    id: "tencent/hy3",
    name: "Tencent HY3",
    description: "OpenRouter general-purpose model for document chat.",
    creditCost: 1,
    reasoning: false,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    badge: null,
    contextWindow: 262144,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: ["low", "medium", "high"],
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra",
    description: "Frontier reasoning and orchestration with a 1M-token window.",
    creditCost: 3,
    reasoning: false,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    badge: "Frontier",
    contextWindow: 1000000,
    outputReserveTokens: 8192,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: ["low", "medium", "high"],
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nemotron 3 Super",
    description: "Long-context planning and cross-document reasoning.",
    creditCost: 1,
    reasoning: false,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    badge: "Free",
    contextWindow: 262144,
    outputReserveTokens: 8192,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: ["low", "medium", "high"],
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    name: "Nemotron 3 Nano",
    description: "Small, quick model for everyday document questions.",
    creditCost: 1,
    reasoning: false,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    badge: "Free",
    contextWindow: 256000,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: [],
  },
  {
    id: "poolside/laguna-s-2.1:free",
    name: "Laguna S 2.1",
    description: "Coding-agent model for code-heavy documents and repos.",
    creditCost: 1,
    reasoning: false,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    badge: "Code",
    contextWindow: 262144,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: [],
  },
  {
    id: "cohere/north-mini-code:free",
    name: "North Mini Code",
    description: "Low-latency agentic coding model with interleaved tool use.",
    creditCost: 1,
    reasoning: false,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    badge: "Code",
    contextWindow: 256000,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
    reasoningEfforts: [],
  },
];

const SYSTEM_PROMPT_TOKEN_RESERVE = 600;
const DOCUMENT_CONTEXT_RESERVE_TOKENS = 12000;
const THINKING_CONTEXT_RESERVE_TOKENS = 4096;
const MESSAGE_TOKEN_OVERHEAD = 12;

const getRouteFileId = (value: unknown) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
};

const estimateTokens = (text: string) => Math.ceil(text.trim().length / 4);

const formatTokenCount = (tokens: number) => {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return String(tokens);
};

function estimateContextUsage({
  messages,
  input,
  selectedModel,
  hasDocumentContext,
  thinkEnabled,
}: {
  messages: ChatMessage[];
  input: string;
  selectedModel?: ModelOption;
  hasDocumentContext: boolean;
  thinkEnabled: boolean;
}) {
  const contextWindow = Math.max(1, selectedModel?.contextWindow || 65536);
  const outputReserve = selectedModel?.outputReserveTokens || 4096;
  const messageTokens = messages.reduce(
    (total, message) =>
      total + estimateTokens(message.content) + MESSAGE_TOKEN_OVERHEAD,
    0,
  );
  const inputTokens = estimateTokens(input);
  const used =
    SYSTEM_PROMPT_TOKEN_RESERVE +
    messageTokens +
    inputTokens +
    outputReserve +
    (hasDocumentContext ? DOCUMENT_CONTEXT_RESERVE_TOKENS : 0) +
    (thinkEnabled ? THINKING_CONTEXT_RESERVE_TOKENS : 0);
  const clampedUsed = Math.min(used, contextWindow);
  const remaining = Math.max(0, contextWindow - used);
  const remainingPercent = Math.max(
    0,
    Math.min(100, Math.round((remaining / contextWindow) * 100)),
  );

  return {
    contextWindow,
    used: clampedUsed,
    remaining,
    remainingPercent,
  };
}

export const ChatPanel = ({
  embedded = false,
  compact = false,
  layout = "default",
  fileId: fileIdProp,
  documentIds: documentIdsProp,
  title = "DocWise Chat",
  subtitle = "Ask questions about this file",
  placeholder = "How can DocWise help?",
  emptyTitle = "Ask about this document",
  emptyDescription = "Type a question below to get started",
  className,
  hideHeader = false,
  allowGeneralChat = false,
  topBarStart,
  messages: controlledMessages,
  setMessages: controlledSetMessages,
  conversationId: controlledConversationId,
  onConversationIdChange,
  onConversationUpdated,
  onCitationNavigate,
}: ChatPanelProps) => {
  const params = useParams();
  const { getToken } = useAuth();

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkEnabled, setThinkEnabled] = useState(false);
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("medium");
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_CHAT_MODELS);
  const [selectedModelId, setSelectedModelId] = useState("gpt-oss-120b");
  const [credits, setCredits] = useState({ used: 0, limit: 30, remaining: 30 });
  const [localConversationId, setLocalConversationId] = useState<string>();
  const [activeCitation, setActiveCitation] = useState<ChatCitation | null>(
    null,
  );
  const [serverContextUsage, setServerContextUsage] = useState<ChatUsage>();

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  // Stop-generation plumbing. `cancelled` is separate from the controller
  // because aborting the fetch otherwise looks like a dropped connection and
  // the resume logic would immediately re-attach to the same stream.
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const API_BASE = getApiBase();
  const routeFileId = getRouteFileId((params as { fileId?: unknown })?.fileId);
  const fileId = fileIdProp || routeFileId;
  const documentIds = useMemo(
    () =>
      documentIdsProp?.length
        ? Array.from(new Set(documentIdsProp))
        : fileId
          ? [fileId]
          : [],
    [documentIdsProp, fileId],
  );
  const conversationId = controlledConversationId ?? localConversationId;
  const messages = controlledMessages ?? localMessages;
  const setMessages = controlledSetMessages ?? setLocalMessages;
  const selectedModel =
    models.find((model) => model.id === selectedModelId) || models[0];
  const selectedCreditCost =
    (selectedModel?.creditCost || 1) +
    (agentEnabled ? AGENT_CREDIT_SURCHARGE : 0) +
    (thinkEnabled ? THINK_CREDIT_SURCHARGE : 0);
  // Some models think without exposing a dial. Deriving this rather than
  // storing it means switching models can never strand an unsupported level.
  const effortLevels = selectedModel?.reasoningEfforts ?? [];
  const activeEffort = effortLevels.includes(reasoningEffort)
    ? reasoningEffort
    : (effortLevels[0] ?? "medium");
  const sentEffort =
    thinkEnabled && effortLevels.length > 0 ? activeEffort : undefined;
  const canSend =
    allowGeneralChat || documentIds.length > 0 || Boolean(conversationId);
  const isFullLayout = layout === "full";

  const modelLabel = useMemo(
    () => selectedModel?.name || "Model",
    [selectedModel],
  );
  const suggestedPrompts = useMemo(
    () =>
      documentIds.length
        ? [
            "Summarize the key findings and cite the strongest evidence.",
            "Compare the main arguments across these sources.",
            "What important questions remain unanswered?",
          ]
        : [
            "Explain a complex topic with a clear example.",
            "Compare two approaches and their trade-offs.",
            "Turn my rough notes into an actionable plan.",
          ],
    [documentIds.length],
  );
  const applySuggestion = useCallback((suggestion: string) => {
    setInput(suggestion);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);
  const contextEstimate = useMemo(
    () =>
      estimateContextUsage({
        messages,
        input,
        selectedModel,
        hasDocumentContext: documentIds.length > 0,
        thinkEnabled,
      }),
    [documentIds.length, input, messages, selectedModel, thinkEnabled],
  );
  const displayedContextEstimate = useMemo(() => {
    if (!serverContextUsage?.contextWindow) return contextEstimate;
    const remaining = Math.max(0, serverContextUsage.contextRemaining);
    return {
      contextWindow: serverContextUsage.contextWindow,
      used: serverContextUsage.contextUsed,
      remaining,
      remainingPercent: Math.max(
        0,
        Math.min(
          100,
          Math.round((remaining / serverContextUsage.contextWindow) * 100),
        ),
      ),
    };
  }, [contextEstimate, serverContextUsage]);

  useEffect(() => {
    if (
      agentEnabled &&
      (!selectedModel?.toolCalling || !selectedModel?.agentToolsEnabled)
    ) {
      setAgentEnabled(false);
    }
  }, [agentEnabled, selectedModel]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl) return;

    requestAnimationFrame(() => {
      scrollEl.scrollTo({
        top: scrollEl.scrollHeight,
        behavior,
      });
    });
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    scrollToBottom(isStreaming ? "auto" : "smooth");
  }, [isStreaming, messages, scrollToBottom]);

  const handleMessagesScroll = useCallback(() => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl) return;

    const distanceFromBottom =
      scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 180;
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const maxHeight = isFullLayout ? 240 : compact ? 128 : 168;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [compact, input, isFullLayout]);

  useEffect(() => {
    const focusChat = () => inputRef.current?.focus();
    window.addEventListener("docwise:focus-chat", focusChat);
    return () => window.removeEventListener("docwise:focus-chat", focusChat);
  }, []);

  useEffect(() => {
    if (controlledConversationId !== undefined) return;
    const storageKey = fileId
      ? `docwise:file-conversation:${fileId}`
      : "docwise:general-conversation";
    const saved = window.localStorage.getItem(storageKey) || undefined;
    setLocalConversationId(saved);
    setServerContextUsage(undefined);
  }, [allowGeneralChat, controlledConversationId, fileId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const token = await getToken();
        const history = await chatApi.getMessages(conversationId, token);
        if (cancelled) return;
        const mapped = history.items.map(mapServerMessage);
        setMessages(mapped);
        const lastUsage = [...mapped]
          .reverse()
          .find((message) => message.usage)?.usage;
        setServerContextUsage(lastUsage);
      } catch {
        if (controlledConversationId === undefined) {
          const storageKey = fileId
            ? `docwise:file-conversation:${fileId}`
            : "docwise:general-conversation";
          window.localStorage.removeItem(storageKey);
          setLocalConversationId(undefined);
        }
      }
    };
    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [controlledConversationId, conversationId, fileId, getToken, setMessages]);

  const refreshCredits = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE}/api/chat/credits`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      setCredits({
        used: Number(data.used || 0),
        limit: Number(data.limit || 30),
        remaining: Number(data.remaining || 0),
      });
    } catch {
      // Credits are advisory in the UI; the backend still enforces them.
    }
  }, [API_BASE, getToken]);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/chat/models`);
        if (!response.ok) return;
        const data: ModelOption[] = await response.json();
        if (cancelled || data.length === 0) return;
        setModels(data);
        setSelectedModelId((current) =>
          data.some((model) => model.id === current) ? current : data[0].id,
        );
      } catch {
        // Keep the bundled fallback list visible if the metadata request fails.
      }
    };

    loadModels();
    refreshCredits();

    return () => {
      cancelled = true;
    };
  }, [API_BASE, refreshCredits]);

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const token = await getToken();
    const created = await chatApi.createConversation(
      {
        mode: documentIds.length ? "document" : "general",
        documentIds,
        modelId: selectedModel?.id,
      },
      token,
    );
    setLocalConversationId(created.id);
    onConversationIdChange?.(created.id);
    if (controlledConversationId === undefined) {
      const storageKey = fileId
        ? `docwise:file-conversation:${fileId}`
        : "docwise:general-conversation";
      window.localStorage.setItem(storageKey, created.id);
    }
    onConversationUpdated?.();
    return created.id;
  }, [
    controlledConversationId,
    conversationId,
    documentIds,
    fileId,
    getToken,
    onConversationIdChange,
    onConversationUpdated,
    selectedModel?.id,
  ]);

  const consumeConversationStream = useCallback(
    async (
      response: Response,
      initialMessageId: string,
      activeConversationId: string,
    ) => {
      const assertStream = async (streamResponse: Response) => {
        if (streamResponse.ok && streamResponse.body) return;
        let message = `Request failed: ${streamResponse.status}`;
        try {
          const errorBody = await streamResponse.json();
          message = errorBody?.detail || message;
        } catch {
          // Keep the HTTP status fallback.
        }
        throw new Error(message);
      };

      await assertStream(response);

      let activeMessageId = initialMessageId;
      let accumulated = "";
      let lastEventId = 0;
      let terminal = false;

      const consume = async (streamResponse: Response) => {
        await assertStream(streamResponse);
        for await (const frame of readSSE<Record<string, unknown>>(
          streamResponse.body!,
        )) {
          const payload = frame.data;
          const frameId = Number(frame.id || payload.id || 0);
          if (Number.isFinite(frameId))
            lastEventId = Math.max(lastEventId, frameId);
          const type = String(payload.type || frame.event || "");
          const serverMessageId = payload.messageId
            ? String(payload.messageId)
            : activeMessageId;

          if (serverMessageId !== activeMessageId) {
            const previousId = activeMessageId;
            activeMessageId = serverMessageId;
            streamingMessageIdRef.current = activeMessageId;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === previousId
                  ? { ...message, id: activeMessageId, status: "streaming" }
                  : message,
              ),
            );
          }

          if (payload.message) {
            const persisted = mapServerMessage(
              payload.message as unknown as ConversationMessageRecord,
            );
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId ? persisted : message,
              ),
            );
            if (persisted.usage) setServerContextUsage(persisted.usage);
            terminal = ["complete", "failed", "cancelled"].includes(
              persisted.status || "",
            );
            continue;
          }

          if (type === "response.delta") {
            accumulated += String(payload.text || "");
            const snapshot = accumulated;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId
                  ? { ...message, content: snapshot, status: "streaming" }
                  : message,
              ),
            );
            continue;
          }

          if (type === "agent.started") {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId
                  ? { ...message, agentMode: true }
                  : message,
              ),
            );
            continue;
          }

          if (
            ["tool.started", "tool.completed", "tool.failed"].includes(type) &&
            payload.toolInvocation
          ) {
            const toolInvocation =
              payload.toolInvocation as unknown as ToolInvocationRecord;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId
                  ? {
                      ...message,
                      agentMode: true,
                      toolInvocations: upsertToolInvocation(
                        message.toolInvocations ?? [],
                        toolInvocation,
                      ),
                    }
                  : message,
              ),
            );
            continue;
          }

          if (type === "citation" && payload.citation) {
            const citation = payload.citation as unknown as ChatCitation;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId
                  ? {
                      ...message,
                      citations: [
                        ...(message.citations ?? []).filter(
                          (item) => item.sourceLabel !== citation.sourceLabel,
                        ),
                        citation,
                      ],
                    }
                  : message,
              ),
            );
            continue;
          }

          if (type === "usage" && payload.usage) {
            const usage = payload.usage as unknown as ChatUsage;
            setServerContextUsage(usage);
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId
                  ? { ...message, usage }
                  : message,
              ),
            );
            continue;
          }

          if (type === "message.completed") {
            const finalContent = String(payload.content || accumulated);
            terminal = true;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId
                  ? {
                      ...message,
                      content: finalContent,
                      status: "complete",
                      provider: payload.provider
                        ? String(payload.provider)
                        : message.provider,
                      modelId: payload.modelId
                        ? String(payload.modelId)
                        : message.modelId,
                      fallbackUsed: Boolean(payload.fallbackUsed),
                      agentMode: Boolean(
                        payload.agentMode ?? message.agentMode,
                      ),
                      agentIterations: Number(
                        payload.agentIterations ?? message.agentIterations ?? 0,
                      ),
                      toolCallCount: Number(
                        payload.toolCallCount ?? message.toolCallCount ?? 0,
                      ),
                    }
                  : message,
              ),
            );
            continue;
          }

          if (type === "message.failed") {
            terminal = true;
            const error = (payload.error ?? {}) as {
              code?: string;
              detail?: string;
            };
            setMessages((previous) =>
              previous.map((message) =>
                message.id === activeMessageId
                  ? {
                      ...message,
                      status: "failed",
                      error: {
                        code: error.code || "generation_failed",
                        detail:
                          error.detail ||
                          "The response could not be completed.",
                      },
                    }
                  : message,
              ),
            );
          }
        }
      };

      const markCancelled = () => {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === activeMessageId
              ? { ...message, status: "cancelled" }
              : message,
          ),
        );
      };

      try {
        await consume(response);
      } catch {
        // Resume below from the durable event buffer or persisted message.
      }
      if (cancelledRef.current) {
        markCancelled();
        return;
      }
      if (terminal) return;
      if (activeMessageId === initialMessageId) {
        throw new Error("The response stream closed before it was accepted.");
      }

      try {
        const token = await getToken();
        const replay = await chatApi.replayEvents(
          activeConversationId,
          activeMessageId,
          lastEventId,
          token,
          abortRef.current?.signal,
        );
        await consume(replay);
      } catch {
        // Fall back to the PostgreSQL message state below.
      }
      if (cancelledRef.current) {
        markCancelled();
        return;
      }
      if (terminal) return;

      const token = await getToken();
      const history = await chatApi.getMessages(activeConversationId, token);
      const persisted = history.items.find(
        (item) => item.id === activeMessageId,
      );
      if (persisted && persisted.status !== "streaming") {
        const mapped = mapServerMessage(persisted);
        setMessages((previous) =>
          previous.map((message) =>
            message.id === activeMessageId ? mapped : message,
          ),
        );
        if (mapped.usage) setServerContextUsage(mapped.usage);
        return;
      }
      throw new Error("The response connection was lost. Retry this message.");
    },
    [getToken, setMessages],
  );

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isStreaming || !canSend) return;

    cancelledRef.current = false;
    abortRef.current = new AbortController();
    setIsStreaming(true);
    shouldAutoScrollRef.current = true;
    try {
      const activeConversationId = await ensureConversation();
      const requestId = crypto.randomUUID();
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        status: "complete",
      };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        reasoning: thinkEnabled,
        agentMode: agentEnabled,
        status: "streaming",
        citations: [],
        toolInvocations: [],
      };
      streamingMessageIdRef.current = assistantMsg.id;
      setMessages((previous) => [...previous, userMsg, assistantMsg]);
      setInput("");

      const token = await getToken();
      const response = await chatApi.sendMessage(
        activeConversationId,
        {
          requestId,
          content: question,
          modelId: selectedModel?.id,
          reasoning: thinkEnabled,
          reasoningEffort: sentEffort,
          agentMode: agentEnabled,
        },
        token,
        abortRef.current.signal,
      );
      await consumeConversationStream(
        response,
        assistantMsg.id,
        activeConversationId,
      );
      onConversationUpdated?.();
    } catch (error) {
      const failedId = streamingMessageIdRef.current;
      const cancelled = cancelledRef.current;
      setMessages((previous) =>
        previous.map((message) =>
          message.id === failedId
            ? cancelled
              ? { ...message, status: "cancelled" }
              : {
                  ...message,
                  status: "failed",
                  error: {
                    code: "request_failed",
                    detail: (error as Error).message,
                  },
                }
            : message,
        ),
      );
    } finally {
      streamingMessageIdRef.current = null;
      abortRef.current = null;
      setIsStreaming(false);
      refreshCredits();
    }
  };

  const handleStop = () => {
    if (!isStreaming) return;
    // The backend has no cancel endpoint, so this detaches the client only —
    // the run finishes server-side and stays in history.
    cancelledRef.current = true;
    abortRef.current?.abort();
  };

  const handleRetry = async (message: ChatMessage) => {
    if (!conversationId || isStreaming || message.status !== "failed") return;
    const temporaryId = crypto.randomUUID();
    streamingMessageIdRef.current = temporaryId;
    setMessages((previous) =>
      previous.map((item) =>
        item.id === message.id
          ? {
              ...item,
              id: temporaryId,
              content: "",
              status: "streaming",
              error: null,
              citations: [],
              toolInvocations: [],
            }
          : item,
      ),
    );
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    setIsStreaming(true);
    try {
      const token = await getToken();
      const response = await chatApi.retryMessage(
        conversationId,
        message.id,
        {
          requestId: crypto.randomUUID(),
          modelId: selectedModel?.id,
          reasoning: thinkEnabled,
          reasoningEffort: sentEffort,
          agentMode: message.agentMode ?? agentEnabled,
        },
        token,
        abortRef.current.signal,
      );
      await consumeConversationStream(response, temporaryId, conversationId);
      onConversationUpdated?.();
    } catch (error) {
      const failedId = streamingMessageIdRef.current;
      const cancelled = cancelledRef.current;
      setMessages((previous) =>
        previous.map((item) =>
          item.id === failedId
            ? cancelled
              ? { ...item, status: "cancelled" }
              : {
                  ...item,
                  status: "failed",
                  error: {
                    code: "retry_failed",
                    detail: (error as Error).message,
                  },
                }
            : item,
        ),
      );
    } finally {
      streamingMessageIdRef.current = null;
      abortRef.current = null;
      setIsStreaming(false);
      refreshCredits();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCitationNavigate = (citation: ChatCitation) => {
    if (citation.sourceRemoved) return;
    if (citation.sourceType === "web") {
      const externalUrl = safeExternalUrl(citation.webUrl);
      if (externalUrl) {
        window.open(externalUrl, "_blank", "noopener,noreferrer");
        setActiveCitation(null);
      }
      return;
    }
    if (!citation.fileId) return;
    if (onCitationNavigate) {
      onCitationNavigate(citation);
      setActiveCitation(null);
      return;
    }
    const page = citation.pageStart ? `?page=${citation.pageStart}` : "";
    window.location.assign(`/workspace/${citation.fileId}${page}`);
  };

  if (!embedded && !isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-[var(--shadow-float)] duration-200 hover:bg-primary/90"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Chat</span>
      </Button>
    );
  }

  const chatContent = (
    <div className="relative flex h-full w-full flex-col">
      {isFullLayout ? (
        <header className="shrink-0 border-b border-border bg-background">
          <div className="mx-auto flex min-h-16 w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            {topBarStart ?? (
              <div className="min-w-0">
                <div className="font-heading text-sm leading-none">{title}</div>
                <div className="mt-1.5 truncate text-[11px] text-muted-foreground">
                  {subtitle}
                </div>
              </div>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ContextRemaining estimate={displayedContextEstimate} />
              <span className="hidden h-8 items-center rounded-lg border border-border bg-card px-2.5 font-mono text-[9px] uppercase tracking-label text-muted-foreground sm:inline-flex">
                {credits.remaining}/{credits.limit} credits
              </span>
            </div>
          </div>
        </header>
      ) : !hideHeader ? (
        <header
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 py-3",
            compact && "px-3 py-2.5",
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-secondary/50">
              <MessageSquare
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium leading-none text-foreground">
                  {title}
                </span>
                {messages.length > 0 ? (
                  <StatusBadge>
                    {messages.length}{" "}
                    {messages.length === 1 ? "message" : "messages"}
                  </StatusBadge>
                ) : null}
              </div>
              <div className="mt-1 truncate text-[10px] text-muted-foreground">
                {subtitle}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge className="hidden sm:inline-flex">
              {credits.remaining}/{credits.limit} credits
            </StatusBadge>
            {!embedded ? (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Close chat"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          className="custom-scrollbar h-full overflow-y-auto"
        >
          <div
            className={cn(
              "mx-auto flex min-h-full w-full flex-col",
              isFullLayout
                ? "max-w-[960px] px-4 py-8 sm:px-6 sm:py-10"
                : "max-w-4xl px-3 py-4",
              compact && !isFullLayout && "px-2.5 py-3",
            )}
          >
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-8">
                <div
                  className={cn(
                    "flex w-full flex-col items-center text-center",
                    isFullLayout ? "max-w-3xl" : "max-w-md",
                  )}
                >
                  <ModelGlyph
                    modelId={selectedModel?.id}
                    size="lg"
                    className={cn(isFullLayout && "size-12 [&_svg]:size-7")}
                  />
                  <StatusBadge className="mt-4">
                    {documentIds.length
                      ? "Source-grounded chat"
                      : "General chat"}
                  </StatusBadge>
                  <h2
                    className={cn(
                      "mt-3 font-heading text-foreground",
                      isFullLayout ? "text-2xl sm:text-[28px]" : "text-base",
                    )}
                  >
                    {emptyTitle}
                  </h2>
                  <p
                    className={cn(
                      "mt-2 text-muted-foreground",
                      isFullLayout
                        ? "max-w-xl text-sm leading-6"
                        : "max-w-sm text-xs leading-5",
                    )}
                  >
                    {canSend
                      ? emptyDescription
                      : "Choose a ready document or switch to general chat."}
                  </p>
                  {canSend ? (
                    <div
                      className={cn(
                        "mt-6 grid w-full gap-2",
                        isFullLayout && "sm:grid-cols-3",
                        !isFullLayout && "mt-4",
                      )}
                    >
                      {suggestedPrompts
                        .slice(0, isFullLayout ? 3 : 2)
                        .map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => applySuggestion(suggestion)}
                            className={cn(
                              "group flex items-start justify-between gap-3 rounded-lg border border-border bg-card text-left text-foreground outline-none transition-colors hover:border-foreground/20 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                              isFullLayout
                                ? "min-h-24 p-3.5 text-xs leading-5"
                                : "p-3 text-[11px] leading-4",
                            )}
                          >
                            <span>{suggestion}</span>
                            <ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "w-full space-y-5 pb-4",
                  isFullLayout && "space-y-8",
                  compact && "space-y-4",
                )}
              >
                {messages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    message={message}
                    model={
                      models.find((model) => model.id === message.modelId) ??
                      selectedModel
                    }
                    compact={compact}
                    layout={layout}
                    onCitationClick={setActiveCitation}
                    onRetry={handleRetry}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "shrink-0 border-t border-border bg-background",
          isFullLayout ? "px-4 py-3 sm:px-6 sm:py-4" : "p-3.5",
          compact && !isFullLayout && "p-2.5",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full",
            isFullLayout ? "max-w-[960px]" : "max-w-4xl",
          )}
        >
          <div className="grid gap-2.5">
            <div className="overflow-visible rounded-lg border border-border bg-card shadow-xs transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:ring-2 focus-within:ring-foreground/[0.04]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isStreaming || !canSend}
                rows={isFullLayout ? 2 : compact ? 2 : 3}
                className={cn(
                  "block w-full resize-none bg-transparent px-4 pt-3.5 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60",
                  isFullLayout
                    ? "min-h-[72px] text-sm leading-6"
                    : compact
                      ? "min-h-[52px] px-3 pt-3"
                      : "min-h-[72px]",
                )}
              />
              <div
                className={cn(
                  "flex flex-wrap items-end justify-between gap-2 p-2",
                  compact && "p-1.5",
                )}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {/* Opens the real upload dialog. It used to be a menu of two
                      items that did nothing when clicked. */}
                  <FileUpload>
                    <button
                      type="button"
                      aria-label="Add a source document"
                      title="Add a source document"
                      disabled={isStreaming}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <PaperclipIcon className="size-3.5" />
                      <span className="sr-only">Add a source document</span>
                    </button>
                  </FileUpload>

                  <ToolButton
                    toggle
                    ariaLabel={
                      // The button is disabled for two different reasons and
                      // the tooltip is the only place either is explained.
                      !selectedModel?.toolCalling
                        ? "Agent needs a tool-calling model"
                        : !selectedModel?.agentToolsEnabled
                          ? "Agent tools are disabled on this server"
                          : "Agent"
                    }
                    active={agentEnabled}
                    disabled={
                      isStreaming ||
                      !selectedModel?.toolCalling ||
                      !selectedModel?.agentToolsEnabled
                    }
                    onClick={() => setAgentEnabled((active) => !active)}
                  >
                    <SearchIcon className="size-3.5" />
                    <span className={compact ? "sr-only" : ""}>Agent</span>
                    <span
                      className={cn(
                        "text-[10px] text-muted-foreground",
                        compact && "hidden",
                      )}
                    >
                      +{AGENT_CREDIT_SURCHARGE}
                    </span>
                  </ToolButton>

                  <ToolButton
                    toggle
                    ariaLabel="Think"
                    active={thinkEnabled}
                    disabled={isStreaming}
                    onClick={() => setThinkEnabled((active) => !active)}
                  >
                    <LightbulbIcon className="size-3.5" />
                    <span className={compact ? "sr-only" : ""}>Think</span>
                    <span
                      className={cn(
                        "text-[10px] text-muted-foreground",
                        compact && "hidden",
                      )}
                    >
                      +{THINK_CREDIT_SURCHARGE}
                    </span>
                  </ToolButton>

                  {thinkEnabled && effortLevels.length > 0 ? (
                    <EffortSelector
                      levels={effortLevels}
                      value={activeEffort}
                      compact={compact}
                      disabled={isStreaming}
                      onChange={setReasoningEffort}
                    />
                  ) : null}
                </div>

                <div className="flex min-w-0 items-center gap-1.5">
                  <ModelSelector
                    models={models}
                    selectedModelId={selectedModelId}
                    selectedCreditCost={selectedCreditCost}
                    compact={compact}
                    open={modelMenuOpen}
                    disabled={isStreaming}
                    onOpenChange={setModelMenuOpen}
                    onModelChange={(model) => {
                      setSelectedModelId(model.id);
                      setModelMenuOpen(false);
                    }}
                  />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      aria-label="Stop generating"
                      title="Stop generating"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background transition-colors hover:bg-foreground/90"
                    >
                      <SquareIcon className="size-3 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!input.trim() || !canSend}
                      aria-label="Send message"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mono-label flex items-center justify-between gap-3 px-1">
              <span className="min-w-0 truncate">
                {modelLabel} · {documentIds.length ? "sources on" : "general"}
              </span>
              <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <Kbd>↵</Kbd> send
                <span className="text-muted-foreground/50">·</span>
                <Kbd>⇧↵</Kbd> newline
              </span>
              <span className="shrink-0">
                {selectedCreditCost} credit{selectedCreditCost === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {activeCitation ? (
        <CitationDrawer
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
          onOpenSource={() => handleCitationNavigate(activeCitation)}
        />
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <section
        className={cn(
          "flex h-full flex-col overflow-hidden bg-background",
          className,
        )}
      >
        {chatContent}
      </section>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[var(--shadow-float)]">
      {chatContent}
    </div>
  );
};

function ChatMessageBubble({
  message,
  model,
  compact,
  layout,
  onCitationClick,
  onRetry,
}: {
  message: ChatMessage;
  model?: ModelOption;
  compact: boolean;
  layout: "default" | "full";
  onCitationClick: (citation: ChatCitation) => void;
  onRetry: (message: ChatMessage) => void;
}) {
  const isUser = message.role === "user";
  const isFullLayout = layout === "full";

  return (
    <article
      className={cn(
        "flex w-full items-start gap-2.5",
        isUser && "justify-end",
        isFullLayout && "gap-3.5",
      )}
    >
      {!isUser ? (
        <ModelGlyph
          modelId={message.modelId ?? model?.id}
          size={compact ? "sm" : "md"}
          className="mt-0.5"
        />
      ) : null}
      <div
        className={cn(
          "min-w-0",
          isUser
            ? isFullLayout
              ? "max-w-[min(88%,720px)]"
              : "max-w-[88%]"
            : "flex-1",
        )}
      >
        <div
          className={cn(
            "flex min-h-5 flex-wrap items-center gap-2",
            isUser && "justify-end",
          )}
        >
          <span className="text-[11px] font-medium text-foreground">
            {isUser ? "You" : "DocWise"}
          </span>
          {!isUser ? (
            <span className="font-mono text-[9px] uppercase tracking-label text-muted-foreground">
              {model?.name ?? "Assistant"}
            </span>
          ) : null}
          {!isUser && message.agentMode ? (
            <StatusBadge>Agent</StatusBadge>
          ) : null}
          {!isUser && message.status === "streaming" ? (
            <StatusBadge dot tone="active">
              Generating
            </StatusBadge>
          ) : null}
          {!isUser && message.status === "cancelled" ? (
            <StatusBadge tone="warning">Stopped</StatusBadge>
          ) : null}
        </div>
        <div
          className={cn(
            "mt-1.5 rounded-lg border text-foreground",
            isUser
              ? "border-border bg-secondary/60 px-3.5 py-2.5"
              : "border-border bg-card px-3.5 py-3.5",
            isFullLayout && isUser && "px-4 py-3",
            isFullLayout && !isUser && "px-5 py-5",
            compact && "px-3 py-3",
          )}
        >
          {!isUser && message.agentMode ? (
            <AgentTrace
              invocations={message.toolInvocations ?? []}
              status={message.status}
              iterations={message.agentIterations}
            />
          ) : null}
          {message.status === "failed" && !message.content ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/[0.04] px-3.5 py-3 text-[12px] text-muted-foreground">
              <p>
                {message.error?.detail ||
                  "The response could not be completed."}
              </p>
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[10px] font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <RotateCcwIcon className="size-3" />
                Retry
              </button>
            </div>
          ) : message.status === "cancelled" && !message.content ? (
            <p className="text-[12px] text-muted-foreground">
              Stopped before any output arrived.
            </p>
          ) : !message.content ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {message.reasoning ? (
                <ThinkingIndicator className="px-0 py-0" />
              ) : (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Thinking...
                </>
              )}
            </div>
          ) : isUser ? (
            <p
              className={cn(
                "whitespace-pre-wrap text-[13px] leading-6",
                isFullLayout && "text-sm leading-7",
              )}
            >
              {message.content}
            </p>
          ) : (
            <div
              className={cn(
                "prose prose-sm max-w-none text-[13px] leading-6 text-foreground dark:prose-invert prose-headings:mb-2 prose-headings:mt-5 prose-headings:text-foreground prose-h2:text-lg prose-h3:text-base prose-p:my-3 prose-p:leading-6 prose-li:my-1 prose-a:text-foreground prose-code:text-foreground prose-pre:border prose-pre:border-border prose-pre:bg-secondary/60 prose-pre:text-foreground prose-blockquote:border-border prose-hr:border-border [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                isFullLayout &&
                  "chat-full-prose text-sm leading-7 prose-p:leading-7 prose-li:leading-7 prose-pre:my-5",
              )}
            >
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={{
                  a: ({ href, children, ...props }) => {
                    if (href?.startsWith("citation:")) {
                      const label = href.slice("citation:".length);
                      const citation = message.citations?.find(
                        (item) => item.sourceLabel === label,
                      );
                      return (
                        <button
                          type="button"
                          disabled={!citation || citation.sourceRemoved}
                          onClick={() => citation && onCitationClick(citation)}
                          className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold no-underline transition-colors hover:bg-secondary disabled:cursor-default disabled:opacity-50"
                        >
                          {citation?.sourceType === "web" ? (
                            <ExternalLinkIcon className="size-2.5" />
                          ) : (
                            <BookOpenIcon className="size-2.5" />
                          )}
                          {children}
                        </button>
                      );
                    }
                    return (
                      <a href={href} {...props}>
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {normalizeMathDelimiters(
                  citationMarkdown(message.content, message.citations ?? []),
                )}
              </ReactMarkdown>
              {message.citations?.length || message.fallbackUsed ? (
                <div className="not-prose mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 font-mono text-[9px] uppercase tracking-label text-muted-foreground">
                  {message.citations?.length ? (
                    <span>
                      {message.citations.length} verified source
                      {message.citations.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {message.fallbackUsed ? (
                    <span>Provider fallback used</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function citationMarkdown(content: string, citations: ChatCitation[]) {
  const labels = new Set(citations.map((citation) => citation.sourceLabel));
  return content.replace(/\[\[((?:S|W)\d+)\]\]/g, (marker, label: string) =>
    labels.has(label) ? `[${label}](citation:${label})` : marker,
  );
}

function upsertToolInvocation(
  invocations: ToolInvocationRecord[],
  next: ToolInvocationRecord,
) {
  const index = invocations.findIndex(
    (invocation) =>
      invocation.id === next.id ||
      invocation.providerToolCallId === next.providerToolCallId,
  );
  const updated = [...invocations];
  if (index === -1) updated.push(next);
  else updated[index] = next;
  return updated.sort((left, right) => left.sequence - right.sequence);
}

function mapServerMessage(message: ConversationMessageRecord): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    reasoning: message.reasoning,
    agentMode: message.agentMode,
    agentIterations: message.agentIterations,
    toolCallCount: message.toolCallCount,
    toolInvocations: message.toolInvocations,
    status: message.status,
    citations: message.citations,
    usage: message.usage,
    provider: message.provider,
    modelId: message.modelId,
    fallbackUsed: message.fallbackUsed,
    error: message.error,
  };
}

const TOOL_LABELS: Record<string, string> = {
  list_selected_documents: "Review selected documents",
  search_selected_documents: "Search selected documents",
  inspect_document_passage: "Inspect document passage",
  search_web: "Search the web",
  inspect_web_source: "Inspect web source",
  calculate: "Calculate",
  get_datetime: "Check date and time",
};

function AgentTrace({
  invocations,
  status,
  iterations,
}: {
  invocations: ToolInvocationRecord[];
  status?: ChatMessage["status"];
  iterations?: number;
}) {
  const running = status === "streaming";
  const failed = status === "failed";
  return (
    <div className="mb-5 overflow-hidden rounded-lg border border-border bg-secondary/20">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {running ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : failed ? (
            <X className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <CheckIcon className="size-3.5 shrink-0 text-foreground" />
          )}
          <span className="font-mono text-[10px] font-semibold uppercase tracking-label text-foreground">
            Agent trace
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {invocations.length
            ? `${invocations.length} step${invocations.length === 1 ? "" : "s"}`
            : running
              ? "Planning"
              : `${iterations ?? 0} iteration${iterations === 1 ? "" : "s"}`}
        </span>
      </div>
      {invocations.length ? (
        <div className="divide-y divide-border/70">
          {invocations.map((invocation, index) => (
            <TraceStep
              key={invocation.id || invocation.providerToolCallId}
              invocation={invocation}
              autoOpen={running && index === invocations.length - 1}
            />
          ))}
        </div>
      ) : (
        <div className="px-3.5 py-3 text-[11px] text-muted-foreground">
          {running
            ? "Choosing the smallest set of read-only tools needed for this request."
            : "No tools were called for this turn."}
        </div>
      )}
    </div>
  );
}

function TraceStep({
  invocation,
  autoOpen,
}: {
  invocation: ToolInvocationRecord;
  autoOpen: boolean;
}) {
  // `open` used to be bound straight to a prop, so every streamed delta
  // re-rendered the trace and slammed shut whatever step the user had expanded.
  // Once they touch it, their choice wins until the message is done.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? autoOpen;

  return (
    <details
      open={open}
      onToggle={(event) => setOverride(event.currentTarget.open)}
      className="group"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-secondary/45 [&::-webkit-details-marker]:hidden">
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background font-mono text-[10px] text-muted-foreground">
          {String(invocation.sequence).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-foreground">
            {TOOL_LABELS[invocation.toolName] || invocation.toolName}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {toolSummary(invocation)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-label text-muted-foreground">
          {invocation.durationMs !== null
            ? `${invocation.durationMs}ms`
            : invocation.status}
          <ChevronDownIcon className="size-3 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid gap-3 border-t border-border bg-secondary/40 px-3.5 py-3 md:grid-cols-2">
        <TraceData label="Arguments" value={invocation.arguments} />
        <TraceData
          label={invocation.error ? "Failure" : "Result"}
          value={invocation.error ?? invocation.resultSummary}
        />
        {invocation.sourceLabels.length ? (
          <div className="md:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-brand text-muted-foreground">
              Evidence
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {invocation.sourceLabels.map((label) => (
                <span
                  key={label}
                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function TraceData({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown>;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-brand text-muted-foreground">
        {label}
      </div>
      <pre className="mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2.5 font-mono text-[10px] leading-4 text-foreground/80">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function toolSummary(invocation: ToolInvocationRecord) {
  if (invocation.error?.detail) return invocation.error.detail;
  const summary = invocation.resultSummary;
  if (typeof summary.message === "string") return summary.message;
  if (invocation.status === "started") return "Running";
  return invocation.status === "complete" ? "Completed" : "Could not complete";
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function CitationDrawer({
  citation,
  onClose,
  onOpenSource,
}: {
  citation: ChatCitation;
  onClose: () => void;
  onOpenSource: () => void;
}) {
  const isWeb = citation.sourceType === "web";
  const location = isWeb
    ? citation.retrievedAt
      ? `Retrieved ${new Date(citation.retrievedAt).toLocaleString()}`
      : "Web source"
    : citation.pageStart
      ? citation.pageEnd && citation.pageEnd !== citation.pageStart
        ? `Pages ${citation.pageStart}-${citation.pageEnd}`
        : `Page ${citation.pageStart}`
      : citation.startTime !== null
        ? `${formatTimestamp(citation.startTime)}-${formatTimestamp(citation.endTime ?? citation.startTime)}`
        : "Source excerpt";

  return (
    <aside className="absolute inset-y-0 right-0 z-[70] flex w-[min(390px,92vw)] flex-col border-l border-border bg-background shadow-[var(--shadow-float)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-label text-muted-foreground">
            Verified source · {citation.sourceLabel}
          </div>
          <p className="mt-1 truncate text-[11px] text-foreground">
            {isWeb
              ? citation.webTitle || citation.webDomain || "Web source"
              : citation.fileName || "Document"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close source"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        <div className="font-mono text-[10px] uppercase tracking-label text-muted-foreground">
          {location}
        </div>
        {citation.sourceRemoved ? (
          <p className="mt-4 rounded-lg border border-border bg-secondary/35 p-3 text-xs leading-5 text-muted-foreground">
            This source was removed from the library. Its excerpt is no longer
            retained.
          </p>
        ) : (
          <blockquote className="mt-4 border-l border-foreground/30 pl-4 text-[13px] leading-6 text-foreground/90">
            {citation.excerpt}
          </blockquote>
        )}
        {isWeb && citation.webDomain ? (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-brand text-muted-foreground">
            {citation.webDomain}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <Button
          type="button"
          size="sm"
          disabled={
            citation.sourceRemoved ||
            (isWeb ? !safeExternalUrl(citation.webUrl) : !citation.fileId)
          }
          onClick={onOpenSource}
          className="w-full"
        >
          <ExternalLinkIcon className="size-3.5" />
          {isWeb ? "Open website" : "Open source"}
        </Button>
      </div>
    </aside>
  );
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function ContextRemaining({
  estimate,
}: {
  estimate: ReturnType<typeof estimateContextUsage>;
}) {
  const status =
    estimate.remainingPercent < 8
      ? "critical"
      : estimate.remainingPercent < 20
        ? "warning"
        : "normal";

  return (
    <div
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-[10px] text-muted-foreground",
        status === "warning" && "border-foreground/25 text-foreground",
        status === "critical" &&
          "border-destructive/45 bg-destructive/10 text-destructive",
      )}
      title={`Approximate context remaining: ${formatTokenCount(estimate.remaining)} of ${formatTokenCount(estimate.contextWindow)} tokens`}
      aria-label={`Approximate context remaining ${estimate.remainingPercent} percent`}
    >
      <CircleGauge className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden font-mono uppercase tracking-label sm:inline">
        Context
      </span>
      <span
        className={cn("font-medium", status === "normal" && "text-foreground")}
      >
        {estimate.remainingPercent}%
      </span>
      <span className="hidden text-muted-foreground lg:inline">
        {formatTokenCount(estimate.remaining)} left
      </span>
      <span className="docwise-meter w-10 sm:w-14" aria-hidden="true">
        <span
          className={cn(
            "docwise-meter-fill block",
            status === "critical" && "bg-destructive",
          )}
          style={{ width: `${estimate.remainingPercent}%` }}
        />
      </span>
    </div>
  );
}

const EFFORT_LABEL: Record<ReasoningEffort, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
};

/**
 * How hard the model should think. Only rendered for models that advertise
 * effort levels — the rest reason at a fixed depth and would reject the value.
 */
function EffortSelector({
  levels,
  value,
  compact,
  disabled,
  onChange,
}: {
  levels: ReasoningEffort[];
  value: ReasoningEffort;
  compact: boolean;
  disabled?: boolean;
  onChange: (next: ReasoningEffort) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Reasoning effort"
      className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border p-0.5"
    >
      {levels.map((level) => {
        const active = level === value;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={`Reasoning effort: ${EFFORT_LABEL[level]}`}
            onClick={() => onChange(level)}
            className={cn(
              "h-full rounded-md px-1.5 text-[10px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              compact ? "min-w-[22px]" : "min-w-[30px]",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {compact ? EFFORT_LABEL[level].charAt(0) : EFFORT_LABEL[level]}
          </button>
        );
      })}
    </div>
  );
}

function ToolButton({
  children,
  active,
  disabled,
  className,
  ariaLabel,
  toggle = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
  /** Announce on/off state. Only true for buttons that latch. */
  toggle?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      aria-pressed={toggle ? Boolean(active) : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
        active &&
          "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
        active && "[&_span]:text-background/70",
        className,
      )}
    >
      {children}
    </button>
  );
}
