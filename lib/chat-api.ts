import { getApiBase } from "@/lib/api-base";

const API_BASE = getApiBase();

export interface ChatCitation {
  id?: string;
  sourceLabel: string;
  sourceOrder: number;
  chunkId: string | null;
  fileId: string | null;
  fileName: string | null;
  excerpt: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  startTime: number | null;
  endTime: number | null;
  retrievalRank: number;
  retrievalScore: number;
  sourceRemoved: boolean;
  sourceType: "document" | "web";
  webUrl: string | null;
  webTitle: string | null;
  webDomain: string | null;
  retrievedAt: string | null;
}

export interface ToolInvocationRecord {
  id: string;
  providerToolCallId: string;
  sequence: number;
  iteration: number;
  toolName: string;
  arguments: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  sourceLabels: string[];
  status: "started" | "complete" | "failed";
  durationMs: number | null;
  error: { code: string; detail: string } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  contextWindow: number;
  contextUsed: number;
  contextRemaining: number;
}

export interface ConversationRecord {
  id: string;
  title: string;
  mode: "general" | "document";
  status: "active" | "archived";
  selectedModelId: string | null;
  documentIds: string[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "complete" | "failed" | "cancelled";
  provider: string | null;
  originalProvider: string | null;
  modelId: string | null;
  reasoning: boolean;
  agentMode: boolean;
  agentIterations: number;
  toolCallCount: number;
  toolInvocations: ToolInvocationRecord[];
  fallbackUsed: boolean;
  requestId: string | null;
  usage: ChatUsage;
  citations: ChatCitation[];
  error: { code: string; detail: string } | null;
  createdAt: string;
  completedAt: string | null;
}

function headers(token?: string | null): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function jsonRequest<T>(
  path: string,
  token?: string | null,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      // Keep the status fallback.
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const chatApi = {
  listConversations(token?: string | null) {
    return jsonRequest<ConversationRecord[]>("/api/chat/conversations", token);
  },
  createConversation(
    input: {
      title?: string;
      mode: "general" | "document";
      documentIds: string[];
      modelId?: string;
    },
    token?: string | null,
  ) {
    return jsonRequest<ConversationRecord>("/api/chat/conversations", token, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getConversation(id: string, token?: string | null) {
    return jsonRequest<ConversationRecord>(
      `/api/chat/conversations/${id}`,
      token,
    );
  },
  updateConversation(
    id: string,
    input: Partial<{
      title: string;
      status: "active" | "archived";
      mode: "general" | "document";
      modelId: string;
    }>,
    token?: string | null,
  ) {
    return jsonRequest<ConversationRecord>(
      `/api/chat/conversations/${id}`,
      token,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  },
  deleteConversation(id: string, token?: string | null) {
    return jsonRequest<void>(`/api/chat/conversations/${id}`, token, {
      method: "DELETE",
    });
  },
  setDocuments(id: string, documentIds: string[], token?: string | null) {
    return jsonRequest<ConversationRecord>(
      `/api/chat/conversations/${id}/documents`,
      token,
      { method: "PUT", body: JSON.stringify({ documentIds }) },
    );
  },
  getMessages(id: string, token?: string | null) {
    return jsonRequest<{
      items: ConversationMessageRecord[];
      nextCursor: string | null;
    }>(`/api/chat/conversations/${id}/messages?limit=100`, token);
  },
  sendMessage(
    id: string,
    input: {
      requestId: string;
      content: string;
      modelId?: string;
      reasoning: boolean;
      agentMode: boolean;
    },
    token?: string | null,
  ) {
    return fetch(`${API_BASE}/api/chat/conversations/${id}/messages`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(input),
    });
  },
  retryMessage(
    conversationId: string,
    messageId: string,
    input: {
      requestId: string;
      modelId?: string;
      reasoning?: boolean;
      agentMode?: boolean;
    },
    token?: string | null,
  ) {
    return fetch(
      `${API_BASE}/api/chat/conversations/${conversationId}/messages/${messageId}/retry`,
      {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(input),
      },
    );
  },
  replayEvents(
    conversationId: string,
    messageId: string,
    afterEventId: number,
    token?: string | null,
  ) {
    return fetch(
      `${API_BASE}/api/chat/conversations/${conversationId}/messages/${messageId}/events?after=${afterEventId}`,
      {
        headers: {
          ...headers(token),
          "Last-Event-ID": String(afterEventId),
        },
      },
    );
  },
};
