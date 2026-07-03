'use client'

import { Dispatch, SetStateAction, useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { Send, Sparkle, MessageCircle, X, Loader2, CircleGauge } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ThinkingIndicator } from '@/components/ui/thinking-indicator'
import { ModelDropdown, type ModelOption } from '@/components/ui/model-dropdown'
import { getApiBase } from '@/lib/api-base'
import { normalizeMathDelimiters } from '@/lib/markdown-math'

// Memoize plugin arrays to avoid recreating on every render
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REMARK_PLUGINS: any = [remarkGfm, remarkMath];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REHYPE_PLUGINS: any = [rehypeKatex];

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: boolean
}

interface ChatPanelProps {
  embedded?: boolean
  messages?: ChatMessage[]
  setMessages?: Dispatch<SetStateAction<ChatMessage[]>>
}

const FALLBACK_CHAT_MODELS: ModelOption[] = [
  {
    id: 'gpt-oss-120b',
    name: 'GPT OSS 120B',
    description: 'Fast document Q&A for everyday questions.',
    creditCost: 1,
    reasoning: false,
    badge: 'Fast',
  },
  {
    id: 'gemma-4-31b',
    name: 'Gemma 4 31B',
    description: 'Document and multimodal reasoning model.',
    creditCost: 1,
    reasoning: false,
    badge: 'Docs',
  },
  {
    id: 'zai-glm-4.7',
    name: 'GLM 4.7 Reasoning',
    description: 'Deep reasoning for harder questions.',
    creditCost: 3,
    reasoning: true,
    badge: 'Deep',
  },
]

export const ChatPanel = ({
  embedded = false,
  messages: controlledMessages,
  setMessages: controlledSetMessages,
}: ChatPanelProps) => {
  const { fileId } = useParams()
  const { getToken } = useAuth()

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_CHAT_MODELS)
  const [selectedModelId, setSelectedModelId] = useState('gpt-oss-120b')
  const [credits, setCredits] = useState({ used: 0, limit: 30, remaining: 30 })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const API_BASE = getApiBase()
  const messages = controlledMessages ?? localMessages
  const setMessages = controlledSetMessages ?? setLocalMessages
  const selectedModel = models.find((model) => model.id === selectedModelId) || models[0]
  const reasoningActive = Boolean(selectedModel?.reasoning)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' })
  }, [isStreaming])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!fileId) return

    let cancelled = false

    const loadHistory = async () => {
      try {
        const token = await getToken()
        const response = await fetch(`${API_BASE}/api/chat/history/${fileId}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (!response.ok) return

        const history: Array<{
          id: string | number
          role: 'user' | 'assistant'
          content: string
          createdAt?: string
        }> = await response.json()

        if (cancelled) return
        setMessages(
          history
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({
              id: String(message.id),
              role: message.role,
              content: message.content,
            })),
        )
      } catch {
        // History is a convenience; chat should still work if loading fails.
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [API_BASE, fileId, getToken, setMessages])

  const refreshCredits = useCallback(async () => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/chat/credits`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!response.ok) return
      const data = await response.json()
      setCredits({
        used: Number(data.used || 0),
        limit: Number(data.limit || 30),
        remaining: Number(data.remaining || 0),
      })
    } catch {
      // Credits are advisory in the UI; the backend still enforces them.
    }
  }, [API_BASE, getToken])

  useEffect(() => {
    let cancelled = false

    const loadModels = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/chat/models`)
        if (!response.ok) return
        const data: ModelOption[] = await response.json()
        if (cancelled || data.length === 0) return
        setModels(data)
        setSelectedModelId((current) => (data.some((model) => model.id === current) ? current : data[0].id))
      } catch {
        // Keep the bundled fallback list visible if the metadata request fails.
      }
    }

    loadModels()
    refreshCredits()

    return () => {
      cancelled = true
    }
  }, [API_BASE, refreshCredits])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isStreaming) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      reasoning: reasoningActive,
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsStreaming(true)

    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/chat/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question,
          file_id: fileId,
          deep_mode: reasoningActive,
          model_id: selectedModel?.id,
        }),
      })

      if (!response.ok || !response.body) {
        let message = `Request failed: ${response.status}`
        try {
          const errorBody = await response.json()
          if (errorBody?.detail) {
            message = errorBody.detail
          }
        } catch {
          // keep fallback
        }
        throw new Error(message)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let rafPending = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)
            if (parsed.text) {
              accumulated += parsed.text
              if (!rafPending) {
                rafPending = true
                requestAnimationFrame(() => {
                  rafPending = false
                  const snapshot = accumulated
                  setMessages((prev) => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last.role === 'assistant') {
                      last.content = snapshot
                    }
                    return updated
                  })
                })
              }
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role === 'assistant') {
          last.content = `Error: ${(err as Error).message}`
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
      refreshCredits()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!embedded && !isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-border bg-primary px-4 py-3 text-primary-foreground shadow-lg duration-200 hover:bg-primary/90"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Chat</span>
      </Button>
    )
  }

  const chatContent = (
    <>
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkle className="h-4 w-4 text-muted-foreground" />
            <span className="mono-label text-foreground">Document Chat</span>
            <span className="hidden items-center gap-1 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <CircleGauge className="h-3 w-3" />
              {credits.remaining}/{credits.limit}
            </span>
          </div>
          {!embedded && (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <ModelDropdown
          models={models}
          isOpen={modelMenuOpen}
          onOpenChange={setModelMenuOpen}
          selectedModelId={selectedModelId}
          onModelChange={(model) => setSelectedModelId(model.id)}
          disabled={isStreaming}
        />
      </div>

      {/* Messages */}
      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4">
        {messages.length === 0 && (
          <div className="flex-col-center justify-center h-full text-center text-muted-foreground">
            <MessageCircle className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium text-foreground">Ask about this document</p>
            <p className="text-xs mt-1">Type a question below to get started</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                ? 'rounded-br-sm border border-border bg-secondary text-foreground'
                : 'rounded-bl-sm border border-border bg-secondary/60 text-foreground'
                }`}
            >
              {msg.content ? (
                msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:surface-3 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-foreground">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                      {normalizeMathDelimiters(msg.content)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {msg.reasoning ? (
                    <ThinkingIndicator className="px-0 py-0" />
                  ) : (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Thinking...
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="h-10 flex-1 rounded-lg border-border bg-input text-sm text-foreground placeholder:text-muted-foreground"
          />
          <Button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            size="icon"
            className="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  )

  if (embedded) {
    return (
      <section className="flex h-full flex-col overflow-hidden border-l border-border bg-background">
        {chatContent}
      </section>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-150 w-105 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
      {chatContent}
    </div>
  )
}
