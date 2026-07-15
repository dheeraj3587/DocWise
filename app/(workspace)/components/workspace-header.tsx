"use client";

import { UserButton } from "@clerk/nextjs";
import {
  ArrowLeft,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconButton } from "@/components/docwise/icon-button";

export const WorkspaceHeader = ({
  fileName,
  outlineOpen,
  onToggleOutline,
  sidePanelOpen,
  onToggleSidePanel,
}: {
  fileName: string;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
}) => {
  const router = useRouter();

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
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="mono-label">Ready</span>
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

        <IconButton aria-label="More options" title="More options">
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </IconButton>

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
