"use client";

import { FileText, Loader2, PanelLeftClose } from "lucide-react";
import type { FileRecord } from "@/lib/api-client";
import {
  BounceSidebar,
  type BounceSidebarItem,
} from "@/components/docwise/bounce-sidebar";
import { IconButton } from "@/components/docwise/icon-button";
import { SectionLabel } from "@/components/docwise/section-label";

export type DocumentTopic = {
  title: string;
  page: number;
  summary?: string;
};

type WorkspaceOutlineProps = {
  file: FileRecord;
  topics: DocumentTopic[];
  topicsLoading: boolean;
  activePage: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
};

const fileTypeLabel = (type?: string) => {
  if (!type) return "Document";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export const WorkspaceOutline = ({
  file,
  topics,
  topicsLoading,
  activePage,
  onSelectPage,
  onClose,
}: WorkspaceOutlineProps) => {
  const visibleTopics =
    topics.length > 0
      ? topics
      : [{ title: "Document start", page: 1, summary: "Open the first page." }];

  const activeIndex = visibleTopics.reduce((closestIndex, topic, index) => {
    if (topic.page > activePage) return closestIndex;
    return topic.page >= visibleTopics[closestIndex].page
      ? index
      : closestIndex;
  }, 0);

  const items: BounceSidebarItem[] = visibleTopics.map((topic) => ({
    label: topic.title,
    meta: `P. ${topic.page}`,
    description: topic.summary,
  }));

  return (
    <aside className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <SectionLabel>Contents</SectionLabel>
        <IconButton
          onClick={onClose}
          aria-label="Hide contents"
          title="Hide contents"
          className="size-8"
        >
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="border-b border-border px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground">
            <FileText className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">
              {file.fileName}
            </p>
            <p className="mt-1 mono-label">{fileTypeLabel(file.fileType)}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <SectionLabel>Document topics</SectionLabel>
          {topicsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading
            </span>
          ) : null}
        </div>

        <BounceSidebar
          aria-label="Document topics"
          items={items}
          value={activeIndex}
          onChange={(index) => onSelectPage(visibleTopics[index].page)}
          className="pl-5"
        />
      </div>
    </aside>
  );
};
