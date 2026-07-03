"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { MessageSquareText } from "lucide-react";

import { ChatPanel } from "@/app/(workspace)/components/ChatPanel";
import { ThemeToggle } from "@/components/theme-toggle";
import { type FileRecord } from "@/lib/api-client";
import { useApiQuery } from "@/lib/hooks";

export default function ChatPage() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const firstName = user?.firstName || "there";

  const { data: files, isLoading } = useApiQuery<FileRecord[]>(
    email ? "/api/files" : null,
    [email],
  );

  const documents = files ?? [];
  const firstReadyDocument = documents.find((doc) => doc.status !== "processing");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border py-5 pl-16 pr-6 sm:pr-10 lg:px-10">
        <div className="min-w-0">
          <span className="font-heading text-lg font-semibold">
            Chat
          </span>
          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
            Ask DocWise about your ready documents.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-sm font-medium">{firstName}</div>
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
              Free plan
            </div>
          </div>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatar: "size-9",
                userButtonTrigger: "rounded-full border border-border p-0.5",
              },
            }}
          />
        </div>
      </div>

      <main className="custom-scrollbar h-[calc(100vh-73px)] overflow-auto px-6 py-8 sm:px-10">
        <div className="mx-auto flex h-full min-h-[640px] max-w-5xl flex-col">
          <div className="mb-6 flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary/45 text-muted-foreground">
              <MessageSquareText className="size-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                DocWise Chat
              </div>
              <h1 className="mt-2 font-heading text-[34px] font-semibold leading-tight">
                Ask across your library.
              </h1>
              <p className="mt-2 max-w-[560px] text-sm leading-relaxed text-muted-foreground">
                {firstReadyDocument
                  ? `Using ${firstReadyDocument.fileName}.`
                  : isLoading
                    ? "Loading your documents..."
                    : "Upload a document from the dashboard to start chatting."}
              </p>
            </div>
          </div>

          <ChatPanel
            embedded
            fileId={firstReadyDocument?.fileId}
            title="Library Chat"
            subtitle={
              firstReadyDocument
                ? `Using ${firstReadyDocument.fileName}`
                : isLoading
                  ? "Loading documents"
                  : "No ready documents yet"
            }
            placeholder="How can DocWise help?"
            emptyTitle={firstReadyDocument ? "Ask from your library" : "No ready documents yet"}
            emptyDescription={
              firstReadyDocument
                ? "Start with a question about your latest ready document."
                : "Upload a PDF, audio, or video file first."
            }
            className="min-h-0 flex-1 rounded-[28px] border border-border bg-background/40"
          />
        </div>
      </main>
    </div>
  );
}
