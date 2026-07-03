'use client'

import { UserButton } from '@clerk/nextjs'
import { ArrowLeft, MessageSquareText, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-toggle'

export const WorkspaceHeader = ({
  fileName,
  outlineOpen,
  onToggleOutline,
  sidePanelOpen,
  onToggleSidePanel,
}: {
  fileName: string
  outlineOpen: boolean
  onToggleOutline: () => void
  sidePanelOpen: boolean
  onToggleSidePanel: () => void
}) => {
  const router = useRouter()
  const iconButtonClass =
    'grid h-9 w-9 place-items-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground'
  const activeIconButtonClass =
    'grid h-9 w-9 place-items-center rounded-lg border border-border bg-secondary text-foreground transition-colors hover:bg-secondary/80'

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 items-center gap-2 rounded-lg border border-transparent px-2.5 text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden text-[13px] sm:inline">Dashboard</span>
        </button>

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <button
          type="button"
          aria-label="Toggle topics"
          title="Toggle topics"
          onClick={onToggleOutline}
          className={outlineOpen ? activeIconButtonClass : iconButtonClass}
        >
          {outlineOpen ? (
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>

        <div className="ml-1 flex min-w-0 flex-col justify-center">
          <span className="truncate text-[14px] text-foreground">{fileName}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
            <span className="mono-label text-emerald-300/80">Ready</span>
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-[13px] text-muted-foreground md:flex">
          <MessageSquareText className="h-4 w-4" strokeWidth={1.75} />
          Chat
        </div>

        <button
          type="button"
          aria-label="Toggle chat"
          title="Toggle chat"
          onClick={onToggleSidePanel}
          className={sidePanelOpen ? activeIconButtonClass : iconButtonClass}
        >
          {sidePanelOpen ? (
            <PanelRightClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelRightOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          aria-label="More options"
          className={iconButtonClass}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        <UserButton
          appearance={{
            elements: {
              userButtonAvatar: 'h-9 w-9',
              userButtonTrigger: 'p-0',
            },
          }}
        />
      </div>
    </header>
  )
}
