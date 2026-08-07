"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  Globe2Icon,
  MenuIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatPanel } from "@/app/(workspace)/components/ChatPanel";
import { BrandMark } from "@/components/docwise/brand-mark";
import { ConfirmDialog } from "@/components/docwise/confirm-dialog";
import { IconButton } from "@/components/docwise/icon-button";
import { Loader } from "@/components/motion/loader";
import { type FileRecord } from "@/lib/api-client";
import { showRetryToast } from "@/lib/app-toasts";
import { chatApi, type ConversationRecord } from "@/lib/chat-api";
import { isFileReady } from "@/lib/file-status";
import { useApiQuery } from "@/lib/hooks";
import { useDismiss } from "@/lib/use-dismiss";
import { cn } from "@/lib/utils";

type ChatContextMode = "general" | "document";

export function ChatPageClient() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const [contextMode, setContextMode] = useState<ChatContextMode>("general");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>();
  const [threadsOpen, setThreadsOpen] = useState(false);

  const { data: files, isLoading } = useApiQuery<FileRecord[]>(
    email ? "/api/files" : null,
    [email],
  );
  const readyDocuments = useMemo(
    () => (files ?? []).filter((document) => isFileReady(document.status)),
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
      // The main chat remains usable even if the conversation rail cannot refresh.
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
        // The main chat remains usable even if the conversation rail cannot load.
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
        emptyTitle={
          contextMode === "document"
            ? "Ask from your sources"
            : "How can I help?"
        }
        emptyDescription={
          contextMode === "document"
            ? "Explore ideas across your selected documents. Grounded answers include verified source links."
            : "Think through a question, compare options, or turn an early idea into a clear next step."
        }
        className="min-h-0 flex-1 border-0 bg-background"
        topBarStart={
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setThreadsOpen(true)}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
              aria-label="Open conversations"
            >
              <MenuIcon className="size-3.5" />
            </button>

            <div className="hidden min-w-0 sm:block">
              <div className="font-heading text-sm leading-none">Chat</div>
              <p className="mt-1.5 flex max-w-[min(32vw,430px)] items-center gap-1.5 text-[10px] text-muted-foreground">
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

            <div className="ml-auto flex min-w-0 items-center gap-2">
              <div
                className="flex shrink-0 items-center rounded-lg border border-border bg-card p-1"
                aria-label="Chat context"
              >
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
  const [actionMenuId, setActionMenuId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<ConversationRecord>();
  const groupedConversations = useMemo(
    () => groupConversations(conversations),
    [conversations],
  );

  const rename = async (conversation: ConversationRecord) => {
    const title = draftTitle.trim();
    setEditingId(undefined);
    if (!title || title === conversation.title) return;
    try {
      const token = await getToken();
      await chatApi.updateConversation(conversation.id, { title }, token);
      await onRefresh();
    } catch {
      // Without this the rail silently reverts and the rename looks accepted.
      showRetryToast({
        title: "Rename failed",
        description: `Could not rename "${conversation.title}".`,
        onRetry: () => void rename(conversation),
      });
    }
  };

  const archive = async (conversation: ConversationRecord) => {
    setActionMenuId(undefined);
    try {
      const token = await getToken();
      await chatApi.updateConversation(
        conversation.id,
        { status: "archived" },
        token,
      );
      await onRefresh();
      if (selectedId === conversation.id) onNew();
    } catch {
      showRetryToast({
        title: "Archive failed",
        description: `Could not archive "${conversation.title}".`,
        onRetry: () => void archive(conversation),
      });
    }
  };

  const remove = async (conversation: ConversationRecord) => {
    setActionMenuId(undefined);
    try {
      const token = await getToken();
      await chatApi.deleteConversation(conversation.id, token);
      await onRefresh();
      if (selectedId === conversation.id) onNew();
    } catch {
      showRetryToast({
        title: "Delete failed",
        description: `Could not delete "${conversation.title}".`,
        onRetry: () => void remove(conversation),
      });
    }
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close conversations"
          onClick={onClose}
          className="fixed inset-0 z-[70] cursor-default bg-foreground/20 md:hidden"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[80] flex w-[min(296px,88vw)] flex-col border-r border-border bg-card transition-transform duration-200 md:static md:z-auto md:w-[280px] md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
          <BrandMark />
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
            New conversation
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {groupedConversations.length ? (
            <div className="space-y-5">
              {groupedConversations.map((group) => (
                <section key={group.label}>
                  <div className="mono-label flex items-center justify-between px-2 pb-1.5">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((conversation) => {
                      const active = conversation.id === selectedId;
                      const menuOpen = actionMenuId === conversation.id;
                      return (
                        <div
                          key={conversation.id}
                          className={cn(
                            "group relative rounded-lg border transition-colors",
                            active
                              ? "border-border bg-secondary/75"
                              : "border-transparent hover:border-border hover:bg-secondary/45",
                          )}
                        >
                          <div className="flex min-h-[54px] items-start gap-2 p-2">
                            <span
                              className={cn(
                                "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground",
                                active && "text-foreground",
                              )}
                            >
                              <MessageSquareIcon className="size-3.5" />
                            </span>

                            {editingId === conversation.id ? (
                              <input
                                autoFocus
                                value={draftTitle}
                                onChange={(event) =>
                                  setDraftTitle(event.target.value)
                                }
                                onBlur={() => rename(conversation)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter")
                                    rename(conversation);
                                  if (event.key === "Escape") {
                                    setEditingId(undefined);
                                  }
                                }}
                                className="mt-0.5 h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-foreground/25"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuId(undefined);
                                  onSelect(conversation);
                                }}
                                className="min-w-0 flex-1 py-0.5 text-left"
                              >
                                <span className="block truncate text-[11px] font-medium leading-4 text-foreground">
                                  {conversation.title}
                                </span>
                                <span
                                  suppressHydrationWarning
                                  className="mt-1 block truncate font-mono text-[9px] uppercase tracking-label text-muted-foreground"
                                >
                                  {conversation.mode === "document"
                                    ? "Documents"
                                    : "General"}
                                  {" · "}
                                  {conversation.messageCount} msg
                                  {conversation.messageCount === 1 ? "" : "s"}
                                  {" · "}
                                  {formatRelativeTime(conversation.updatedAt)}
                                </span>
                              </button>
                            )}

                            <ConversationActionMenu
                              open={menuOpen}
                              title={conversation.title}
                              onToggle={() =>
                                setActionMenuId((current) =>
                                  current === conversation.id
                                    ? undefined
                                    : conversation.id,
                                )
                              }
                              onDismiss={() => setActionMenuId(undefined)}
                              onRename={() => {
                                setEditingId(conversation.id);
                                setDraftTitle(conversation.title);
                                setActionMenuId(undefined);
                              }}
                              onArchive={() => archive(conversation)}
                              onDelete={() => {
                                setActionMenuId(undefined);
                                setPendingDelete(conversation);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mx-2 mt-8 rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <span className="mx-auto grid size-8 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
                <MessageSquareIcon className="size-3.5" />
              </span>
              <p className="mt-3 text-[11px] font-medium text-foreground">
                No conversations yet
              </p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Start a chat and it will stay organized here.
              </p>
            </div>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next: boolean) => {
          if (!next) setPendingDelete(undefined);
        }}
        title="Delete conversation?"
        description={
          <>
            <span className="font-medium text-foreground">
              {pendingDelete?.title}
            </span>{" "}
            and its messages will be permanently removed.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(undefined);
          if (target) await remove(target);
        }}
      />
    </>
  );
}

function ConversationActionMenu({
  open,
  title,
  onToggle,
  onDismiss,
  onRename,
  onArchive,
  onDelete,
}: {
  open: boolean;
  title: string;
  onToggle: () => void;
  onDismiss: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const ref = useDismiss<HTMLDivElement>(open, onDismiss);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label={`Actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-60 transition-colors hover:bg-background hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
      >
        <MoreHorizontalIcon className="size-3.5" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[90] mt-1 w-36 rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-float)]"
        >
          <ConversationAction
            icon={<PencilIcon className="size-3" />}
            label="Rename"
            onClick={onRename}
          />
          <ConversationAction
            icon={<ArchiveIcon className="size-3" />}
            label="Archive"
            onClick={onArchive}
          />
          <ConversationAction
            destructive
            icon={<Trash2Icon className="size-3" />}
            label="Delete"
            onClick={onDelete}
          />
        </div>
      ) : null}
    </div>
  );
}

function ConversationAction({
  icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        destructive && "text-destructive hover:text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
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
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const label =
    selectedIds.length === 1
      ? documents.find((document) => document.fileId === selectedIds[0])
          ?.fileName || "1 document"
      : `${selectedIds.length} documents`;

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-8 max-w-[min(34vw,250px)] items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[10px] text-foreground transition-colors hover:bg-secondary"
      >
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-[90] w-[min(340px,82vw)] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-float)]">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div>
              <div className="mono-label">Conversation sources</div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {selectedIds.length} of {documents.length} selected
              </p>
            </div>
            {selectedIds.length ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
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
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border border-border bg-background",
                      checked &&
                        "border-foreground bg-foreground text-background",
                    )}
                  >
                    {checked ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {document.fileName}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 w-full rounded-md bg-foreground text-[10px] font-medium text-background transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
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
      aria-pressed={active}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:px-2.5",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

type ConversationGroup = {
  label: string;
  items: ConversationRecord[];
};

function groupConversations(
  conversations: ConversationRecord[],
): ConversationGroup[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
  const buckets: Record<
    "Today" | "Previous 7 days" | "Earlier",
    ConversationRecord[]
  > = {
    Today: [],
    "Previous 7 days": [],
    Earlier: [],
  };

  for (const conversation of conversations) {
    const updatedAt = new Date(conversation.updatedAt).getTime();
    if (updatedAt >= startOfToday) buckets.Today.push(conversation);
    else if (updatedAt >= sevenDaysAgo) {
      buckets["Previous 7 days"].push(conversation);
    } else buckets.Earlier.push(conversation);
  }

  return (
    Object.entries(buckets) as [
      ConversationGroup["label"],
      ConversationRecord[],
    ][]
  )
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "recent";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}
