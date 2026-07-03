"use client";

import { useUser } from "@clerk/nextjs";

import { ChatPanel } from "@/app/(workspace)/components/ChatPanel";
import { type FileRecord } from "@/lib/api-client";
import { useApiQuery } from "@/lib/hooks";

export default function ChatPage() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  const { data: files, isLoading } = useApiQuery<FileRecord[]>(
    email ? "/api/files" : null,
    [email],
  );

  const documents = files ?? [];
  const firstReadyDocument = documents.find((doc) => doc.status !== "processing");

  return (
    <div className="h-screen min-h-0 bg-background text-foreground">
      <ChatPanel
        embedded
        fileId={firstReadyDocument?.fileId}
        title="DocWise Chat"
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
        className="h-full border-0 bg-background"
      />
    </div>
  );
}
