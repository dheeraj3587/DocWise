'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { Send, Brain, Sparkle, MessageCircle, X, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export const ChatPanel = ({ embedded = false }: { embedded?: boolean }) => {
  const { fileId } = useParams()
  const { getToken } = useAuth()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [deepMode, setDeepMode] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

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
          deep_mode: deepMode,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

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
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  last.content = accumulated
                }
                return updated
              })
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
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg hover:shadow-xl duration-200 glow-gold-subtle"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Chat</span>
      </Button>
    )
  }

  const chatContent = (
    <>
      {/* Header */}
      <div className="flex-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkle className="w-4 h-4 text-gold" />
          <span className="font-semibold text-sm text-foreground">AI Chat</span>
          <span className="text-[10px] text-muted-foreground font-medium px-1.5 py-0.5 surface-3 rounded">
            {deepMode ? 'GPT-5.2' : 'GPT-5-mini'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDeepMode(!deepMode)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${deepMode
              ? 'bg-accent text-accent-foreground hover:bg-accent/80'
              : 'surface-3 text-muted-foreground hover:text-foreground'
              }`}
            title={deepMode ? 'Deep Mode ON' : 'Deep Mode OFF'}
          >
            <Brain className="w-3.5 h-3.5" />
            {deepMode ? 'Deep' : 'Fast'}
          </button>
          {!embedded && (
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:surface-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex-col-center justify-center h-full text-center text-muted-foreground">
            <MessageCircle className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-foreground/70">Ask about this document</p>
            <p className="text-xs mt-1">Type a question below to get started</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-foreground text-background rounded-br-sm'
                : 'surface-2 text-foreground rounded-bl-sm border border-border'
                }`}
            >
              {msg.content ? (
                msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:surface-3 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking...
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 h-10 text-sm rounded-xl"
          />
          <Button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            size="icon"
            className="h-10 w-10 rounded-xl"
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
      <div className="flex flex-col h-full glass rounded-xl overflow-hidden">
        {chatContent}
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-105 h-150 glass-strong rounded-2xl flex flex-col overflow-hidden shadow-xl">
      {chatContent}
    </div>
  )
}
