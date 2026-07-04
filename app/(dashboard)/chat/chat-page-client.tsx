"use client";

import { useUser } from "@clerk/nextjs";
import { FileTextIcon, Globe2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { ChatPanel } from "@/app/(workspace)/components/ChatPanel";
import { type FileRecord } from "@/lib/api-client";
import { useApiQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type ChatContextMode = "general" | "document";

export function ChatPageClient() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const [contextMode, setContextMode] = useState<ChatContextMode>("general");
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();

  const { data: files, isLoading } = useApiQuery<FileRecord[]>(
    email ? "/api/files" : null,
    [email],
  );

  const readyDocuments = useMemo(
    () => (files ?? []).filter((doc) => doc.status !== "processing"),
    [files],
  );
  const selectedDocument =
    readyDocuments.find((doc) => doc.fileId === selectedFileId) ?? readyDocuments[0];
  const documentContextEnabled = contextMode === "document" && Boolean(selectedDocument);

  const subtitle = documentContextEnabled
    ? `Using ${selectedDocument.fileName}`
    : "General chat · no uploaded files used";

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.28em] text-muted-foreground">
              Context
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {isLoading ? "Loading your library..." : subtitle}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex items-center rounded-full border border-border bg-background/70 p-1">
              <ContextButton
                active={contextMode === "general"}
                icon={<Globe2Icon className="size-3.5" />}
                label="General"
                onClick={() => setContextMode("general")}
              />
              <ContextButton
                active={contextMode === "document"}
                disabled={!readyDocuments.length}
                icon={<FileTextIcon className="size-3.5" />}
                label="Documents"
                onClick={() => setContextMode("document")}
              />
            </div>

            {contextMode === "document" ? (
              <select
                value={selectedDocument?.fileId ?? ""}
                disabled={!readyDocuments.length}
                onChange={(event) => setSelectedFileId(event.target.value)}
                className="h-8 max-w-[220px] rounded-full border border-border bg-background px-3 text-[11px] text-foreground outline-none transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Document context"
              >
                {readyDocuments.length ? null : <option value="">No ready documents</option>}
                {readyDocuments.map((doc) => (
                  <option key={doc.fileId} value={doc.fileId}>
                    {doc.fileName}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      </div>

      <ChatPanel
        key={documentContextEnabled ? `document-${selectedDocument.fileId}` : "general"}
        embedded
        allowGeneralChat={contextMode === "general"}
        fileId={documentContextEnabled ? selectedDocument.fileId : undefined}
        title="DocWise Chat"
        subtitle={isLoading ? "Loading documents" : subtitle}
        placeholder={
          documentContextEnabled
            ? "Ask about this document..."
            : "Ask anything without document context..."
        }
        emptyTitle={documentContextEnabled ? "Ask from this document" : "General chat"}
        emptyDescription={
          documentContextEnabled
            ? "This message will use the selected document as context."
            : "No uploaded content is used unless you switch to Documents."
        }
        className="min-h-0 flex-1 border-0 bg-background"
      />
    </div>
  );
}

function ContextButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
