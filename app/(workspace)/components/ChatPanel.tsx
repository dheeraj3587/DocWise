'use client'

import {
  AudioWaveformIcon,
  ChevronDownIcon,
  FileIcon,
  ImageIcon,
  LightbulbIcon,
  Loader2,
  MessageCircle,
  PaperclipIcon,
  SearchIcon,
  Send,
  X,
} from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
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
} from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { Button } from '@/components/ui/button'
import { ThinkingIndicator } from '@/components/ui/thinking-indicator'
import { getApiBase } from '@/lib/api-base'
import { normalizeMathDelimiters } from '@/lib/markdown-math'
import { cn } from '@/lib/utils'

// Memoize plugin arrays to avoid recreating on every render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REMARK_PLUGINS: any = [remarkGfm, remarkMath]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REHYPE_PLUGINS: any = [rehypeKatex]

const THINK_CREDIT_SURCHARGE = 3

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: boolean
}

export interface ModelOption {
  id: string
  name: string
  description: string
  creditCost: number
  reasoning: boolean
  badge?: string | null
}

interface ChatPanelProps {
  embedded?: boolean
  compact?: boolean
  fileId?: string
  title?: string
  subtitle?: string
  placeholder?: string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  hideHeader?: boolean
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
    description: 'Document and multimodal model for richer files.',
    creditCost: 1,
    reasoning: false,
    badge: 'Docs',
  },
  {
    id: 'zai-glm-4.7',
    name: 'GLM 4.7',
    description: 'Higher-capacity model for complex documents.',
    creditCost: 3,
    reasoning: false,
    badge: 'Heavy',
  },
]

const getRouteFileId = (value: unknown) => {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export const ChatPanel = ({
  embedded = false,
  compact = false,
  fileId: fileIdProp,
  title = 'DocWise Chat',
  subtitle = 'Ask questions about this file',
  placeholder = 'How can DocWise help?',
  emptyTitle = 'Ask about this document',
  emptyDescription = 'Type a question below to get started',
  className,
  hideHeader = false,
  messages: controlledMessages,
  setMessages: controlledSetMessages,
}: ChatPanelProps) => {
  const params = useParams()
  const { getToken } = useAuth()

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [thinkEnabled, setThinkEnabled] = useState(false)
  const [deepSearchEnabled, setDeepSearchEnabled] = useState(false)
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_CHAT_MODELS)
  const [selectedModelId, setSelectedModelId] = useState('gpt-oss-120b')
  const [credits, setCredits] = useState({ used: 0, limit: 30, remaining: 30 })

  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const API_BASE = getApiBase()
  const routeFileId = getRouteFileId((params as { fileId?: unknown })?.fileId)
  const fileId = fileIdProp || routeFileId
  const messages = controlledMessages ?? localMessages
  const setMessages = controlledSetMessages ?? setLocalMessages
  const selectedModel = models.find((model) => model.id === selectedModelId) || models[0]
  const selectedCreditCost = (selectedModel?.creditCost || 1) + (thinkEnabled ? THINK_CREDIT_SURCHARGE : 0)

  const modelLabel = useMemo(() => selectedModel?.name || 'Model', [selectedModel])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scrollEl = messagesScrollRef.current
    if (!scrollEl) return

    requestAnimationFrame(() => {
      scrollEl.scrollTo({
        top: scrollEl.scrollHeight,
        behavior,
      })
    })
  }, [])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    scrollToBottom(isStreaming ? 'auto' : 'smooth')
  }, [isStreaming, messages, scrollToBottom])

  const handleMessagesScroll = useCallback(() => {
    const scrollEl = messagesScrollRef.current
    if (!scrollEl) return

    const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom < 180
  }, [])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const focusChat = () => inputRef.current?.focus()
    window.addEventListener('docwise:focus-chat', focusChat)
    return () => window.removeEventListener('docwise:focus-chat', focusChat)
  }, [])

  useEffect(() => {
    if (!fileId) {
      setMessages([])
      return
    }

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
    if (!question || isStreaming || !fileId) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      reasoning: thinkEnabled,
    }

    shouldAutoScrollRef.current = true
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
          deep_mode: thinkEnabled,
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
            if (parsed.error) {
              throw new Error(parsed.error)
            }
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
                      updated[updated.length - 1] = { ...last, content: snapshot }
                    }
                    return updated
                  })
                })
              }
            }
          } catch (error) {
            if (error instanceof SyntaxError) continue
            throw error
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${(err as Error).message}`,
          }
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
      refreshCredits()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Chat</span>
      </Button>
    )
  }

  const chatContent = (
    <div className="flex h-full w-full flex-col">
      {!hideHeader ? (
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.28em] text-muted-foreground">
              {title}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground sm:inline-flex">
              {credits.remaining}/{credits.limit} credits
            </span>
            {!embedded ? (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto h-full w-full max-w-4xl">
          <div
            ref={messagesScrollRef}
            onScroll={handleMessagesScroll}
            className="custom-scrollbar h-full overflow-y-auto px-4 py-5"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <MessageCircle className={cn('mb-3 opacity-35', compact ? 'h-8 w-8' : 'h-10 w-10')} />
                <p className="text-[13px] font-medium text-foreground">{emptyTitle}</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed">{fileId ? emptyDescription : 'Upload or open a ready document to start chatting.'}</p>
              </div>
            ) : (
              <div className={cn('space-y-4', compact && 'space-y-3')}>
                {messages.map((message) => (
                  <ChatMessageBubble key={message.id} message={message} compact={compact} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={cn('shrink-0 p-4', compact && 'p-3')}>
        <div className="mx-auto w-full max-w-4xl">
          <div className="grid gap-3">
            <div className="overflow-visible rounded-[24px] border border-border bg-secondary/45 shadow-xs/5">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isStreaming || !fileId}
                rows={compact ? 2 : 3}
                className={cn(
                  'block w-full resize-none bg-transparent px-4 pt-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/72 disabled:cursor-not-allowed disabled:opacity-60',
                  compact ? 'min-h-[52px]' : 'min-h-[72px]',
                )}
              />
              <div className={cn('flex flex-wrap items-center justify-between gap-2 p-2', compact && 'p-1.5')}>
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
                        <AttachItem icon={<FileIcon className="h-3.5 w-3.5" />} label="Upload file" />
                        <AttachItem icon={<ImageIcon className="h-3.5 w-3.5" />} label="Upload photo" />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center rounded-full border border-border">
                    <ToolButton
                      ariaLabel="DeepSearch"
                      active={deepSearchEnabled}
                      disabled={isStreaming}
                      className="rounded-l-full rounded-r-none border-0"
                      onClick={() => setDeepSearchEnabled((active) => !active)}
                    >
                      <SearchIcon className="h-3.5 w-3.5" />
                      <span className={compact ? 'hidden sm:inline' : ''}>DeepSearch</span>
                    </ToolButton>
                    <div className="h-6 w-px bg-border" />
                    <ToolButton
                      ariaLabel="DeepSearch options"
                      disabled={isStreaming}
                      className="rounded-l-none rounded-r-full border-0 px-2"
                    >
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    </ToolButton>
                  </div>

                  <ToolButton
                    ariaLabel="Think"
                    active={thinkEnabled}
                    disabled={isStreaming}
                    onClick={() => setThinkEnabled((active) => !active)}
                  >
                    <LightbulbIcon className="h-3.5 w-3.5" />
                    <span>Think</span>
                    <span className="text-[10px] text-muted-foreground">+{THINK_CREDIT_SURCHARGE}</span>
                  </ToolButton>
                </div>

                <div className="flex items-center gap-1.5">
                  <ModelSelect
                    models={models}
                    selectedModelId={selectedModelId}
                    selectedCreditCost={selectedCreditCost}
                    thinkEnabled={thinkEnabled}
                    open={modelMenuOpen}
                    disabled={isStreaming}
                    onOpenChange={setModelMenuOpen}
                    onModelChange={(model) => {
                      setSelectedModelId(model.id)
                      setModelMenuOpen(false)
                    }}
                  />
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
                    disabled={isStreaming || !input.trim() || !fileId}
                    aria-label="Send message"
                    className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              <span className="truncate">{modelLabel}</span>
              <span>{selectedCreditCost} credit{selectedCreditCost === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <section className={cn('flex h-full flex-col overflow-hidden bg-background', className)}>
        {chatContent}
      </section>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-[28px] border border-border bg-background shadow-xl">
      {chatContent}
    </div>
  )
}

function ChatMessageBubble({ message, compact }: { message: ChatMessage; compact: boolean }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%]',
          isUser
            ? 'rounded-[22px] rounded-br-sm border border-border bg-background px-3.5 py-2.5 text-foreground'
            : 'text-foreground',
          compact && isUser && 'px-3.5 py-2.5',
        )}
      >
        {!message.content ? (
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
          <p className="whitespace-pre-wrap text-[13px] leading-6">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-[13px] leading-6 text-foreground dark:prose-invert prose-headings:mb-2 prose-headings:mt-5 prose-headings:text-foreground prose-h2:text-lg prose-h3:text-base prose-p:my-3 prose-p:leading-6 prose-li:my-1 prose-a:text-foreground prose-code:text-foreground prose-pre:border prose-pre:border-border prose-pre:bg-secondary/60 prose-pre:text-foreground prose-blockquote:border-border prose-hr:border-border">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
              {normalizeMathDelimiters(message.content)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolButton({
  children,
  active,
  disabled,
  className,
  ariaLabel,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  disabled?: boolean
  className?: string
  ariaLabel: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50',
        active && 'bg-foreground text-background hover:bg-foreground/90 hover:text-background',
        active && '[&_span]:text-background/70',
        className,
      )}
    >
      {children}
    </button>
  )
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
  )
}

function ModelSelect({
  models,
  selectedModelId,
  selectedCreditCost,
  thinkEnabled,
  open,
  disabled,
  onOpenChange,
  onModelChange,
}: {
  models: ModelOption[]
  selectedModelId: string
  selectedCreditCost: number
  thinkEnabled: boolean
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onModelChange: (model: ModelOption) => void
}) {
  const selected = models.find((model) => model.id === selectedModelId) || models[0]

  if (!selected) return null

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 min-w-[120px] max-w-[170px] items-center justify-between gap-2 rounded-full border border-border bg-background/70 px-2.5 text-left text-[11px] text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 truncate">{selected.name}</span>
        <ChevronDownIcon className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute bottom-10 right-0 z-[100] max-h-56 w-[230px] overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-2xl shadow-black/40">
          {models.map((model) => {
            const active = model.id === selected.id
            const creditCost = model.creditCost + (thinkEnabled ? THINK_CREDIT_SURCHARGE : 0)
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onModelChange(model)}
                className={cn(
                  'flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">{model.name}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 opacity-75">{model.description}</span>
                </span>
                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px]">
                  {active ? selectedCreditCost : creditCost}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
