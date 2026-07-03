'use client'

import { FileText, Loader2, PanelLeftClose } from 'lucide-react'
import type { FileRecord } from '@/lib/api-client'

export type DocumentTopic = {
  title: string
  page: number
  summary?: string
}

type WorkspaceOutlineProps = {
  file: FileRecord
  topics: DocumentTopic[]
  topicsLoading: boolean
  activePage: number
  onSelectPage: (page: number) => void
  onClose: () => void
}

const fileTypeLabel = (type?: string) => {
  if (!type) return 'Document'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export const WorkspaceOutline = ({
  file,
  topics,
  topicsLoading,
  activePage,
  onSelectPage,
  onClose,
}: WorkspaceOutlineProps) => {
  const visibleTopics = topics.length > 0
    ? topics
    : [{ title: 'Document start', page: 1, summary: 'Open the first page.' }]

  return (
    <aside className="hidden h-full w-[272px] shrink-0 flex-col border-r border-border bg-background lg:flex">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="mono-label">Contents</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide contents"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-4 rounded-lg border border-border bg-secondary/45 p-3">
          <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
            <FileText className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <p className="truncate text-[13px] font-medium text-foreground">{file.fileName}</p>
          <p className="mt-1 mono-label">{fileTypeLabel(file.fileType)}</p>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="mono-label">Topics</span>
          {topicsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          {visibleTopics.map((topic) => {
            const active = topic.page === activePage
            return (
              <button
                key={`${topic.title}-${topic.page}`}
                type="button"
                onClick={() => onSelectPage(topic.page)}
                className={`group rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{topic.title}</span>
                    {topic.summary ? (
                      <span className="mt-1 block line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {topic.summary}
                      </span>
                    ) : null}
                  </span>
                  <span className={`mono-label shrink-0 ${active ? 'text-foreground' : ''}`}>
                    {topic.page}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
