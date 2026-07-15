"use client";

import {
  AudioWaveformIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleGauge,
  FileIcon,
  ExternalLinkIcon,
  ImageIcon,
  LightbulbIcon,
  Loader2,
  MessageCircle,
  PaperclipIcon,
  SearchIcon,
  Send,
  RotateCcwIcon,
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
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { Button } from "@/components/ui/button";
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

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  creditCost: number;
  reasoning: boolean;
  provider?: string;
  providerLabel?: string;
  badge?: string | null;
  contextWindow: number;
  outputReserveTokens: number;
  toolCalling: boolean;
  agentToolsEnabled: boolean;
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
  },
  {
    id: "tencent/hy3:free",
    name: "Tencent HY3",
    description: "OpenRouter free model for general and document chat.",
    creditCost: 1,
    reasoning: false,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    badge: "Free",
    contextWindow: 262144,
    outputReserveTokens: 4096,
    toolCalling: true,
    agentToolsEnabled: false,
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [thinkEnabled, setThinkEnabled] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_CHAT_MODELS);
  const [selectedModelId, setSelectedModelId] = useState("gpt-oss-120b");
  const [credits, setCredits] = useState({ used: 0, limit: 30, remaining: 30 });
  const [localConversationId, setLocalConversationId] = useState<string>();
  const [activeCitation, setActiveCitation] = useState<ChatCitation | null>(null);
  const [serverContextUsage, setServerContextUsage] = useState<ChatUsage>();

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

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
  const canSend = allowGeneralChat || documentIds.length > 0 || Boolean(conversationId);
  const isFullLayout = layout === "full";

  const modelLabel = useMemo(
    () => selectedModel?.name || "Model",
    [selectedModel],
  );
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
          if (Number.isFinite(frameId)) lastEventId = Math.max(lastEventId, frameId);
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
                message.id === activeMessageId ? { ...message, usage } : message,
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
                      agentMode: Boolean(payload.agentMode ?? message.agentMode),
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
                          error.detail || "The response could not be completed.",
                      },
                    }
                  : message,
              ),
            );
          }
        }
      };

      try {
        await consume(response);
      } catch {
        // Resume below from the durable event buffer or persisted message.
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
        );
        await consume(replay);
      } catch {
        // Fall back to the PostgreSQL message state below.
      }
      if (terminal) return;

      const token = await getToken();
      const history = await chatApi.getMessages(activeConversationId, token);
      const persisted = history.items.find((item) => item.id === activeMessageId);
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
          agentMode: agentEnabled,
        },
        token,
      );
      await consumeConversationStream(
        response,
        assistantMsg.id,
        activeConversationId,
      );
      onConversationUpdated?.();
    } catch (error) {
      const failedId = streamingMessageIdRef.current;
      setMessages((previous) =>
        previous.map((message) =>
          message.id === failedId
            ? {
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
      setIsStreaming(false);
      refreshCredits();
    }
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
          agentMode: message.agentMode ?? agentEnabled,
        },
        token,
      );
      await consumeConversationStream(response, temporaryId, conversationId);
      onConversationUpdated?.();
    } catch (error) {
      const failedId = streamingMessageIdRef.current;
      setMessages((previous) =>
        previous.map((item) =>
          item.id === failedId
            ? {
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
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-border bg-primary px-4 py-3 text-primary-foreground shadow-lg duration-200 hover:bg-primary/90"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Chat</span>
      </Button>
    );
  }

  const chatContent = (
    <div className="relative flex h-full w-full flex-col">
      {isFullLayout ? (
        <div className="shrink-0 border-b border-border bg-background">
          <div className="mx-auto flex min-h-14 w-full max-w-[1760px] flex-wrap items-center justify-between gap-3 px-[clamp(1rem,3vw,3.25rem)] py-2.5">
            {topBarStart ?? (
              <div className="min-w-0">
                <div className="font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.28em] text-muted-foreground">
                  {title}
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {subtitle}
                </div>
              </div>
            )}
            <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
              <ContextRemaining estimate={displayedContextEstimate} />
              <span className="hidden h-8 items-center rounded-lg border border-border bg-background px-2.5 text-[10px] text-muted-foreground md:inline-flex">
                {credits.remaining}/{credits.limit} credits
              </span>
              <ModelSelect
                models={models}
                selectedModelId={selectedModelId}
                selectedCreditCost={selectedCreditCost}
                thinkEnabled={thinkEnabled}
                agentEnabled={agentEnabled}
                open={modelMenuOpen}
                disabled={isStreaming}
                onOpenChange={setModelMenuOpen}
                onModelChange={(model) => {
                  setSelectedModelId(model.id);
                  setModelMenuOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      ) : !hideHeader ? (
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.28em] text-muted-foreground">
              {title}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {subtitle}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden h-8 items-center rounded-lg border border-border px-2.5 text-[10px] text-muted-foreground sm:inline-flex">
              {credits.remaining}/{credits.limit} credits
            </span>
            {!embedded ? (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "mx-auto h-full w-full",
            isFullLayout
              ? "max-w-[1760px] px-[clamp(1rem,3vw,3.25rem)]"
              : "max-w-4xl",
          )}
        >
          <div
            ref={messagesScrollRef}
            onScroll={handleMessagesScroll}
            className={cn(
              "custom-scrollbar h-full overflow-y-auto",
              isFullLayout ? "px-0 py-8" : "px-4 py-5",
            )}
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
                <span className="mb-4 grid size-10 place-items-center rounded-lg border border-border bg-secondary">
                  <MessageCircle className="size-4 opacity-70" />
                </span>
                <p className="text-[13px] font-medium text-foreground">
                  {emptyTitle}
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed">
                  {canSend
                    ? emptyDescription
                    : "Choose a ready document or switch to general chat."}
                </p>
              </div>
            ) : (
              <div className={cn("space-y-4", compact && "space-y-3")}>
                {messages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    message={message}
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
          "shrink-0",
          isFullLayout
            ? "border-t border-border bg-background px-[clamp(1rem,3vw,3.25rem)] py-3"
            : "p-4",
          compact && !isFullLayout && "p-3",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full",
            isFullLayout ? "max-w-[1760px]" : "max-w-4xl",
          )}
        >
          <div className="grid gap-3">
            <div className="overflow-visible rounded-lg border border-border bg-card shadow-xs/5 transition-colors focus-within:border-foreground/20">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isStreaming || !canSend}
                rows={isFullLayout ? 2 : compact ? 2 : 3}
                className={cn(
                  "block w-full resize-none bg-transparent px-4 pt-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/72 disabled:cursor-not-allowed disabled:opacity-60",
                  isFullLayout
                    ? "min-h-[64px] text-sm"
                    : compact
                      ? "min-h-[52px]"
                      : "min-h-[72px]",
                )}
              />
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 p-2",
                  compact && "p-1.5",
                )}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <div className="relative">
                    <ToolButton
                      ariaLabel="Attach"
                      disabled={isStreaming}
                      active={attachMenuOpen}
                      onClick={() => setAttachMenuOpen((open) => !open)}
                    >
                      <PaperclipIcon className="h-3.5 w-3.5" />
                      <span className="sr-only">Attach</span>
                    </ToolButton>
                    {attachMenuOpen ? (
                      <div className="absolute bottom-10 left-0 z-50 w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-xs shadow-xl shadow-black/20">
                        <AttachItem
                          icon={<FileIcon className="h-3.5 w-3.5" />}
                          label="Upload file"
                        />
                        <AttachItem
                          icon={<ImageIcon className="h-3.5 w-3.5" />}
                          label="Upload photo"
                        />
                      </div>
                    ) : null}
                  </div>

                  <ToolButton
                    ariaLabel={
                      selectedModel?.agentToolsEnabled
                        ? "Agent"
                        : "Agent is not enabled"
                    }
                    active={agentEnabled}
                    disabled={
                      isStreaming ||
                      !selectedModel?.toolCalling ||
                      !selectedModel?.agentToolsEnabled
                    }
                    onClick={() => setAgentEnabled((active) => !active)}
                  >
                    <SearchIcon className="h-3.5 w-3.5" />
                    <span className={compact ? "hidden sm:inline" : ""}>Agent</span>
                    <span className="text-[10px] text-muted-foreground">
                      +{AGENT_CREDIT_SURCHARGE}
                    </span>
                  </ToolButton>

                  <ToolButton
                    ariaLabel="Think"
                    active={thinkEnabled}
                    disabled={isStreaming}
                    onClick={() => setThinkEnabled((active) => !active)}
                  >
                    <LightbulbIcon className="h-3.5 w-3.5" />
                    <span>Think</span>
                    <span className="text-[10px] text-muted-foreground">
                      +{THINK_CREDIT_SURCHARGE}
                    </span>
                  </ToolButton>
                </div>

                <div className="flex items-center gap-1.5">
                  {!isFullLayout ? (
                    <ModelSelect
                      models={models}
                      selectedModelId={selectedModelId}
                      selectedCreditCost={selectedCreditCost}
                      thinkEnabled={thinkEnabled}
                      agentEnabled={agentEnabled}
                      open={modelMenuOpen}
                      disabled={isStreaming}
                      onOpenChange={setModelMenuOpen}
                      onModelChange={(model) => {
                        setSelectedModelId(model.id);
                        setModelMenuOpen(false);
                      }}
                    />
                  ) : null}
                  <ToolButton
                    ariaLabel="Voice"
                    disabled={isStreaming}
                    className="bg-foreground font-medium text-background hover:bg-foreground/90 hover:text-background"
                  >
                    <AudioWaveformIcon className="h-3.5 w-3.5" />
                    <span className="sr-only">Voice</span>
                  </ToolButton>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isStreaming || !input.trim() || !canSend}
                    aria-label="Send message"
                    className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isStreaming ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              <span className="truncate">{modelLabel}</span>
              <span>
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
    <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
      {chatContent}
    </div>
  );
};

function ChatMessageBubble({
  message,
  compact,
  layout,
  onCitationClick,
  onRetry,
}: {
  message: ChatMessage;
  compact: boolean;
  layout: "default" | "full";
  onCitationClick: (citation: ChatCitation) => void;
  onRetry: (message: ChatMessage) => void;
}) {
  const isUser = message.role === "user";
  const isFullLayout = layout === "full";

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
        isFullLayout && "w-full",
      )}
    >
      <div
        className={cn(
          isFullLayout && isUser
            ? "max-w-[min(92%,720px)] sm:max-w-[min(72%,820px)] lg:max-w-[min(48%,860px)]"
            : isFullLayout
              ? "w-full"
              : "max-w-[88%]",
          isUser
            ? "rounded-lg rounded-br-sm border border-border bg-secondary/50 px-3.5 py-2.5 text-foreground"
            : "text-foreground",
          compact && isUser && "px-3.5 py-2.5",
          isFullLayout && isUser && "px-4 py-3",
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
          <div className="rounded-lg border border-border bg-secondary/35 px-3.5 py-3 text-[12px] text-muted-foreground">
            <p>{message.error?.detail || "The response could not be completed."}</p>
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[10px] font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <RotateCcwIcon className="size-3" />
              Retry
            </button>
          </div>
        ) : !message.content ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {message.reasoning ? (
              <ThinkingIndicator className="px-0 py-0" />
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
              "prose prose-sm max-w-none text-[13px] leading-6 text-foreground dark:prose-invert prose-headings:mb-2 prose-headings:mt-5 prose-headings:text-foreground prose-h2:text-lg prose-h3:text-base prose-p:my-3 prose-p:leading-6 prose-li:my-1 prose-a:text-foreground prose-code:text-foreground prose-pre:border prose-pre:border-border prose-pre:bg-secondary/60 prose-pre:text-foreground prose-blockquote:border-border prose-hr:border-border",
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
                        className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[9px] font-semibold no-underline transition-colors hover:bg-secondary disabled:cursor-default disabled:opacity-50"
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
              <div className="not-prose mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                {message.citations?.length ? (
                  <span>
                    {message.citations.length} verified source
                    {message.citations.length === 1 ? "" : "s"}
                  </span>
                ) : null}
                {message.fallbackUsed ? <span>Provider fallback used</span> : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
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
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border/70 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {running ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : failed ? (
            <X className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <CheckIcon className="size-3.5 shrink-0 text-foreground" />
          )}
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-foreground">
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
            <details
              key={invocation.id || invocation.providerToolCallId}
              open={running && index === invocations.length - 1}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-secondary/45 [&::-webkit-details-marker]:hidden">
                <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background font-mono text-[9px] text-muted-foreground">
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
                <span className="flex shrink-0 items-center gap-2 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
                  {invocation.durationMs !== null
                    ? `${invocation.durationMs}ms`
                    : invocation.status}
                  <ChevronDownIcon className="size-3 transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="grid gap-3 border-t border-border/60 bg-background/35 px-3.5 py-3 md:grid-cols-2">
                <TraceData label="Arguments" value={invocation.arguments} />
                <TraceData
                  label={invocation.error ? "Failure" : "Result"}
                  value={invocation.error ?? invocation.resultSummary}
                />
                {invocation.sourceLabels.length ? (
                  <div className="md:col-span-2">
                    <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
                      Evidence
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {invocation.sourceLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] text-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
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

function TraceData({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown>;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <pre className="mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-background p-2.5 font-mono text-[9px] leading-4 text-foreground/80">
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
    <aside className="absolute inset-y-0 right-0 z-[70] flex w-[min(390px,92vw)] flex-col border-l border-border bg-background shadow-2xl shadow-black/50">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
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
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          {location}
        </div>
        {citation.sourceRemoved ? (
          <p className="mt-4 rounded-lg border border-border bg-secondary/35 p-3 text-xs leading-5 text-muted-foreground">
            This source was removed from the library. Its excerpt is no longer retained.
          </p>
        ) : (
          <blockquote className="mt-4 border-l border-foreground/30 pl-4 text-[13px] leading-6 text-foreground/90">
            {citation.excerpt}
          </blockquote>
        )}
        {isWeb && citation.webDomain ? (
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
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
      <span className="hidden font-mono uppercase tracking-[0.18em] sm:inline">
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
      <span
        className="h-1.5 w-10 overflow-hidden rounded-full bg-secondary sm:w-14"
        aria-hidden="true"
      >
        <span
          className={cn(
            "block h-full rounded-full bg-foreground",
            status === "critical" && "bg-destructive",
          )}
          style={{ width: `${estimate.remainingPercent}%` }}
        />
      </span>
    </div>
  );
}

function ToolButton({
  children,
  active,
  disabled,
  className,
  ariaLabel,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
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

function AttachItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {icon}
      {label}
    </button>
  );
}

function ModelSelect({
  models,
  selectedModelId,
  selectedCreditCost,
  thinkEnabled,
  agentEnabled,
  open,
  disabled,
  onOpenChange,
  onModelChange,
}: {
  models: ModelOption[];
  selectedModelId: string;
  selectedCreditCost: number;
  thinkEnabled: boolean;
  agentEnabled: boolean;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onModelChange: (model: ModelOption) => void;
}) {
  const selected =
    models.find((model) => model.id === selectedModelId) || models[0];
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const preferredWidth = 320;
    const width = Math.min(
      preferredWidth,
      window.innerWidth - viewportPadding * 2,
    );
    const estimatedHeight = Math.min(360, 74 + models.length * 66);
    const spaceAbove = rect.top - viewportPadding - gap;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const openAbove =
      spaceAbove >= Math.min(estimatedHeight, 240) || spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      180,
      Math.min(360, openAbove ? spaceAbove : spaceBelow),
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.right - width),
      window.innerWidth - width - viewportPadding,
    );
    const top = openAbove
      ? Math.max(
          viewportPadding,
          rect.top - gap - Math.min(estimatedHeight, maxHeight),
        )
      : Math.min(
          window.innerHeight - viewportPadding - maxHeight,
          rect.bottom + gap,
        );

    setMenuPosition({ left, top, width, maxHeight });
  }, [models.length]);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      onOpenChange(false);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const onScroll = (event: Event) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open, updatePosition]);

  if (!selected) return null;

  const modelMenu =
    open && typeof document !== "undefined" && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
              width: menuPosition.width,
              maxHeight: menuPosition.maxHeight,
            }}
            className="fixed z-[1000] overflow-y-auto rounded-lg border border-border bg-background p-1.5 shadow-2xl shadow-black/50"
          >
            <div className="flex items-center justify-between px-2.5 py-2">
              <span className="font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.28em] text-muted-foreground">
                Model
              </span>
              <span className="text-[10px] text-muted-foreground">credits</span>
            </div>
            <div className="space-y-1">
              {models.map((model) => {
                const active = model.id === selected.id;
                const creditCost =
                  model.creditCost +
                  (agentEnabled ? AGENT_CREDIT_SURCHARGE : 0) +
                  (thinkEnabled ? THINK_CREDIT_SURCHARGE : 0);
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => onModelChange(model)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                    )}
                  >
                    <ProviderMark
                      provider={model.provider}
                      providerLabel={model.providerLabel}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium">
                          {model.name}
                        </span>
                        {model.badge ? (
                          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {model.badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 opacity-75">
                        {model.description}
                      </span>
                      <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.22em] text-muted-foreground/80">
                        {model.providerLabel || "Provider"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded border border-border px-1.5 py-0.5 text-[9px]">
                        {active ? selectedCreditCost : creditCost}
                      </span>
                      {active ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 min-w-[132px] max-w-[190px] items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-[11px] text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ProviderMark
            provider={selected.provider}
            providerLabel={selected.providerLabel}
            compact
          />
          <span className="min-w-0 truncate">{selected.name}</span>
        </span>
        <ChevronDownIcon
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {modelMenu}
    </>
  );
}

function ProviderMark({
  provider,
  providerLabel,
  compact = false,
}: {
  provider?: string;
  providerLabel?: string;
  compact?: boolean;
}) {
  const text =
    provider === "openrouter"
      ? "OR"
      : provider === "cerebras"
        ? "C"
        : (providerLabel || "AI").slice(0, 2).toUpperCase();

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md border border-border bg-background font-mono font-semibold uppercase text-muted-foreground",
        compact ? "h-4 w-4 text-[7px]" : "h-7 w-7 text-[9px]",
      )}
      title={providerLabel || provider || "Provider"}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
