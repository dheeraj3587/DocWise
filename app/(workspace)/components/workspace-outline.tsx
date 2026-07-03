'use client'

import { FileText, MessageSquareText, NotebookText, PanelLeftClose } from 'lucide-react'
import type { FileRecord } from '@/lib/api-client'
import type { LeftPanelView } from '../workspace/[fileId]/page'

type WorkspaceOutlineProps = {
  file: FileRecord
  activePanel: LeftPanelView
  onPanelChange: (panel: LeftPanelView) => void
  onClose: () => void
}

const fileTypeLabel = (type?: string) => {
  if (!type) return 'Document'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export const WorkspaceOutline = ({
  file,
  activePanel,
  onPanelChange,
  onClose,
}: WorkspaceOutlineProps) => {
  const items: Array<{
    id: LeftPanelView
    label: string
    description: string
    icon: typeof NotebookText
  }> = [
    {
      id: 'document',
      label: 'Notes',
      description: 'Write and export your reading notes',
      icon: NotebookText,
    },
    {
      id: 'chat',
      label: 'Chat',
      description: 'Ask questions about this file',
      icon: MessageSquareText,
    },
  ]

  return (
    <aside className="hidden h-full w-[256px] shrink-0 flex-col border-r border-border bg-background lg:flex">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="mono-label">Workspace</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide outline"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-3 rounded-lg border border-border bg-secondary/60 p-3">
          <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground">
            <FileText className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <p className="truncate text-[13px] font-medium text-foreground">{file.fileName}</p>
          <p className="mt-1 mono-label">{fileTypeLabel(file.fileType)}</p>
        </div>

        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon
            const active = activePanel === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPanelChange(item.id)}
                className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                }`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {item.description}
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
