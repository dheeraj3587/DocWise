"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconButton } from "@/components/docwise/icon-button";
import { normalizeFileStatus, fileStatusLabel } from "@/lib/file-status";
import { useDismiss } from "@/lib/use-dismiss";
import { showSuccessToast, showRetryToast } from "@/lib/app-toasts";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  ready: "bg-success",
  processing: "bg-warning animate-pulse",
  failed: "bg-destructive",
};

export const WorkspaceHeader = ({
  fileName,
  fileStatus,
  fileUrl,
  outlineOpen,
  onToggleOutline,
  sidePanelOpen,
  onToggleSidePanel,
  onRefresh,
}: {
  fileName: string;
  fileStatus?: string | null;
  fileUrl?: string | null;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onRefresh?: () => void;
}) => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismiss<HTMLDivElement>(menuOpen, () =>
    setMenuOpen(false),
  );
  const status = normalizeFileStatus(fileStatus);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showSuccessToast({
        title: "Link copied",
        description: "Workspace URL is on your clipboard.",
      });
    } catch {
      showRetryToast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access.",
        retryLabel: "Dismiss",
      });
    }
    setMenuOpen(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-transparent px-2.5 text-muted-foreground outline-none transition-colors hover:border-border hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden text-[13px] sm:inline">Dashboard</span>
        </button>

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <IconButton
          aria-label="Toggle topics"
          title="Toggle topics"
          onClick={onToggleOutline}
          active={outlineOpen}
        >
          {outlineOpen ? (
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </IconButton>

        <div className="ml-1 flex min-w-0 flex-col justify-center border-l border-border pl-3">
          <span className="truncate text-[14px] text-foreground">
            {fileName}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span
              className={cn("size-1 rounded-full", STATUS_DOT[status])}
              aria-hidden
            />
            <span className="mono-label">{fileStatusLabel(fileStatus)}</span>
          </span>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <IconButton
          aria-label="Toggle chat"
          title="Toggle chat"
          onClick={onToggleSidePanel}
          active={sidePanelOpen}
        >
          {sidePanelOpen ? (
            <PanelRightClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelRightOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </IconButton>

        <div className="relative" ref={menuRef}>
          <IconButton
            aria-label="More options"
            title="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            active={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </IconButton>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={copyLink}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Copy className="size-3.5" strokeWidth={1.75} />
                Copy workspace link
              </button>
              {fileUrl ? (
                <a
                  role="menuitem"
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} />
                  Open original file
                </a>
              ) : null}
              {onRefresh ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onRefresh();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <RotateCw className="size-3.5" strokeWidth={1.75} />
                  Refresh document
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        <UserButton
          appearance={{
            elements: {
              userButtonAvatar: "h-9 w-9",
              userButtonTrigger: "p-0",
            },
          }}
        />
      </div>
    </header>
  );
};
