"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import {
  ArchiveIcon,
  CheckIcon,
  FileTextIcon,
  Globe2Icon,
  MenuIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatPanel } from "@/app/(workspace)/components/ChatPanel";
import { BrandMark } from "@/components/docwise/brand-mark";
import { IconButton } from "@/components/docwise/icon-button";
import { Loader } from "@/components/motion/loader";
import {
  chatApi,
  type ConversationRecord,
} from "@/lib/chat-api";
import { type FileRecord } from "@/lib/api-client";
import { useApiQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type ChatContextMode = "general" | "document";

export function ChatPageClient() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const [contextMode, setContextMode] = useState<ChatContextMode>("general");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [threadsOpen, setThreadsOpen] = useState(false);

  const { data: files, isLoading } = useApiQuery<FileRecord[]>(
    email ? "/api/files" : null,
    [email],
  );
  const readyDocuments = useMemo(
    () => (files ?? []).filter((document) => document.status === "ready"),
    [files],
  );
  const selectedDocuments = readyDocuments.filter((document) =>
    selectedFileIds.includes(document.fileId),
  );

  const loadConversations = useCallback(async () => {
    try {
      const token = await getToken();
      const records = await chatApi.listConversations(token);
      setConversations(records);
    } catch {
      // The main chat remains usable even if the thread rail cannot refresh.
    }
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;

    getToken()
      .then((token) => chatApi.listConversations(token))
      .then((records) => {
        if (!cancelled) setConversations(records);
      })
      .catch(() => {
        // The main chat remains usable even if the thread rail cannot load.
      });

    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const selectConversation = (conversation: ConversationRecord) => {
    setSelectedConversationId(conversation.id);
    setContextMode(conversation.mode);
    setSelectedFileIds(conversation.documentIds);
    setThreadsOpen(false);
  };

  const newConversation = () => {
    setSelectedConversationId(undefined);
    setContextMode("general");
    setSelectedFileIds([]);
    setThreadsOpen(false);
  };

  const updateDocuments = async (nextIds: string[]) => {
    setSelectedFileIds(nextIds);
    setContextMode(nextIds.length ? "document" : "general");
    if (!selectedConversationId) return;
    try {
      const token = await getToken();
      const updated = await chatApi.setDocuments(
        selectedConversationId,
        nextIds,
        token,
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === updated.id ? updated : conversation,
        ),
      );
    } catch {
      await loadConversations();
    }
  };

  const changeContextMode = async (mode: ChatContextMode) => {
    if (mode === "general") {
      await updateDocuments([]);
      return;
    }
    const nextIds = selectedFileIds.length
      ? selectedFileIds
      : readyDocuments[0]
        ? [readyDocuments[0].fileId]
        : [];
    await updateDocuments(nextIds);
  };

  const subtitle =
    contextMode === "document" && selectedDocuments.length
      ? selectedDocuments.length === 1
        ? `Using ${selectedDocuments[0].fileName}`
        : `Using ${selectedDocuments.length} selected documents`
      : "General chat · no uploaded files used";

  return (
    <div className="flex h-[100dvh] w-screen min-w-0 overflow-hidden bg-background text-foreground">
      <ConversationSidebar
        open={threadsOpen}
        conversations={conversations}
        selectedId={selectedConversationId}
        onClose={() => setThreadsOpen(false)}
        onNew={newConversation}
        onSelect={selectConversation}
        onRefresh={loadConversations}
      />

      <ChatPanel
        embedded
        layout="full"
        allowGeneralChat={contextMode === "general"}
        documentIds={contextMode === "document" ? selectedFileIds : []}
        conversationId={selectedConversationId}
        onConversationIdChange={(conversationId) => {
          setSelectedConversationId(conversationId);
          loadConversations();
        }}
        onConversationUpdated={loadConversations}
        title="DocWise Chat"
        subtitle={isLoading ? "Loading documents" : subtitle}
        placeholder={
          contextMode === "document"
            ? "Ask across the selected documents..."
            : "Ask anything without document context..."
        }
        emptyTitle={contextMode === "document" ? "Ask from your sources" : "General chat"}
        emptyDescription={
          contextMode === "document"
            ? "Every grounded answer will include verified source links."
            : "Uploaded content is used only when you explicitly select Documents."
        }
        className="min-h-0 flex-1 border-0 bg-background"
        topBarStart={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setThreadsOpen(true)}
              className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
              aria-label="Open conversations"
            >
              <MenuIcon className="size-3.5" />
            </button>
            <BrandMark compact className="hidden lg:inline-flex" />
            <div className="hidden h-7 w-px bg-border lg:block" />
            <div className="min-w-0">
              <div className="mono-label font-semibold leading-none">
                Context
              </div>
              <p className="mt-1 flex max-w-[min(34vw,480px)] items-center gap-1.5 text-[11px] text-muted-foreground">
                {isLoading ? (
                  <>
                    <Loader
                      variant="ascii-braille"
                      size={11}
                      speed={0.9}
                      label="Loading your library"
                      className="shrink-0"
                    />
                    <span className="min-w-0 truncate">
                      Loading your library...
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 truncate">{subtitle}</span>
                )}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-border bg-background p-1">
                <ContextButton
                  active={contextMode === "general"}
                  icon={<Globe2Icon className="size-3.5" />}
                  label="General"
                  onClick={() => changeContextMode("general")}
                />
                <ContextButton
                  active={contextMode === "document"}
                  disabled={!readyDocuments.length}
                  icon={<FileTextIcon className="size-3.5" />}
                  label="Documents"
                  onClick={() => changeContextMode("document")}
                />
              </div>

              {contextMode === "document" ? (
                <DocumentPicker
                  documents={readyDocuments}
                  selectedIds={selectedFileIds}
                  onChange={updateDocuments}
                />
              ) : null}
            </div>
          </div>
        }
      />
    </div>
  );
}

function ConversationSidebar({
  open,
  conversations,
  selectedId,
  onClose,
  onNew,
  onSelect,
  onRefresh,
}: {
  open: boolean;
  conversations: ConversationRecord[];
  selectedId?: string;
  onClose: () => void;
  onNew: () => void;
  onSelect: (conversation: ConversationRecord) => void;
  onRefresh: () => Promise<void>;
}) {
  const { getToken } = useAuth();
  const [editingId, setEditingId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState("");

  const rename = async (conversation: ConversationRecord) => {
    const title = draftTitle.trim();
    setEditingId(undefined);
    if (!title || title === conversation.title) return;
    const token = await getToken();
    await chatApi.updateConversation(conversation.id, { title }, token);
    await onRefresh();
  };

  const archive = async (conversation: ConversationRecord) => {
    const token = await getToken();
    await chatApi.updateConversation(
      conversation.id,
      { status: "archived" },
      token,
    );
    await onRefresh();
    if (selectedId === conversation.id) onNew();
  };

  const remove = async (conversation: ConversationRecord) => {
    const token = await getToken();
    await chatApi.deleteConversation(conversation.id, token);
    await onRefresh();
    if (selectedId === conversation.id) onNew();
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-[80] flex w-[min(286px,88vw)] flex-col border-r border-border bg-background transition-transform duration-200 md:static md:z-auto md:w-64 md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <BrandMark compact />
        <IconButton
          aria-label="Close conversations"
          onClick={onClose}
          className="md:hidden"
        >
          <XIcon className="size-3.5" />
        </IconButton>
      </div>
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-[11px] font-medium text-background transition-opacity hover:opacity-90"
        >
          <PlusIcon className="size-3.5" />
          New chat
        </button>
      </div>
      <div className="mono-label px-4 pb-2 font-semibold">Conversations</div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length ? (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const active = conversation.id === selectedId;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex min-h-10 items-center gap-1 rounded-lg px-2 transition-colors",
                    active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <MessageSquareIcon className="size-3.5 shrink-0" />
                  {editingId === conversation.id ? (
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={() => rename(conversation)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") rename(conversation);
                        if (event.key === "Escape") setEditingId(undefined);
                      }}
                      className="h-7 min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelect(conversation)}
                      className="min-w-0 flex-1 truncate py-2 text-left text-[11px]"
                    >
                      {conversation.title}
                    </button>
                  )}
                  <div className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex">
                    <MiniAction
                      label="Rename"
                      onClick={() => {
                        setEditingId(conversation.id);
                        setDraftTitle(conversation.title);
                      }}
                    >
                      <PencilIcon className="size-3" />
                    </MiniAction>
                    <MiniAction label="Archive" onClick={() => archive(conversation)}>
                      <ArchiveIcon className="size-3" />
                    </MiniAction>
                    <MiniAction label="Delete" onClick={() => remove(conversation)}>
                      <Trash2Icon className="size-3" />
                    </MiniAction>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-8 text-center text-[11px] leading-5 text-muted-foreground">
            Your named conversations will appear here.
          </div>
        )}
      </div>
    </aside>
  );
}

function DocumentPicker({
  documents,
  selectedIds,
  onChange,
}: {
  documents: FileRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = selectedIds.length === 1
    ? documents.find((document) => document.fileId === selectedIds[0])?.fileName || "1 document"
    : `${selectedIds.length} documents`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 max-w-[min(42vw,270px)] items-center gap-2 rounded-lg border border-border bg-background px-3 text-[11px] text-foreground transition-colors hover:bg-secondary"
      >
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-10 z-[90] w-[min(330px,82vw)] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-float)]">
          <div className="mono-label border-b border-border px-3 py-2.5">
            Use as context
          </div>
          <div className="custom-scrollbar max-h-72 overflow-y-auto p-1.5">
            {documents.map((document) => {
              const checked = selectedIds.includes(document.fileId);
              return (
                <button
                  key={document.fileId}
                  type="button"
                  onClick={() =>
                    onChange(
                      checked
                        ? selectedIds.filter((id) => id !== document.fileId)
                        : [...selectedIds, document.fileId],
                    )
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border border-border",
                      checked && "bg-foreground text-background",
                    )}
                  >
                    {checked ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span className="truncate">{document.fileName}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 w-full rounded-md bg-foreground text-[10px] font-medium text-background"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniAction({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
    >
      {children}
    </button>
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
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
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
