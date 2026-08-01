"use client";

import { type MouseEvent, useState } from "react";
import Link from "next/link";
import { useAuth, UserButton, useUser } from "@clerk/nextjs";
import { motion } from "motion/react";
import {
  ArrowRight,
  FileText,
  Music,
  Search,
  Trash2,
  Upload,
  Video,
} from "lucide-react";

import { EmptyState } from "@/components/docwise/empty-state";
import { IconButton } from "@/components/docwise/icon-button";
import { SectionLabel } from "@/components/docwise/section-label";
import { StatusBadge } from "@/components/docwise/status-badge";
import { Loader } from "@/components/motion/loader";
import { ParticleFieldLazy } from "@/components/particle-field-lazy";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteFile, type FileRecord } from "@/lib/api-client";
import { showRetryToast, showSuccessToast } from "@/lib/app-toasts";
import { useApiQuery } from "@/lib/hooks";
import { FileUpload } from "../components/file-upload";

export default function Dashboard() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const email = user?.primaryEmailAddress?.emailAddress;
  const {
    data: files,
    isLoading,
    refetch,
  } = useApiQuery<FileRecord[]>(email ? "/api/files" : null, [email]);
  const documents = files ?? [];
  const readyCount = documents.filter(
    (doc) => doc.status !== "processing",
  ).length;
  const firstName = user?.firstName || "there";

  const deleteDocument = async (
    fileId: string,
    fileName: string,
    confirmFirst = true,
  ) => {
    if (
      confirmFirst &&
      !confirm(`Delete "${fileName}"? This cannot be undone.`)
    ) {
      return;
    }
    setDeletingId(fileId);
    try {
      const token = await getToken();
      await deleteFile(fileId, token);
      refetch();
      showSuccessToast({
        title: "Deleted",
        description: `${fileName} was removed from your library.`,
      });
    } catch (error) {
      console.error("Delete failed:", error);
      showRetryToast({
        title: "Could not delete file",
        description:
          "The file is still in your library. Retry the delete action.",
        onRetry: () => void deleteDocument(fileId, fileName, false),
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = async (
    event: MouseEvent,
    fileId: string,
    fileName: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    await deleteDocument(fileId, fileName);
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background text-foreground">
      <header className="docwise-rail flex h-14 shrink-0 items-center border-b pr-4 pl-16 sm:pr-6 lg:pr-8 lg:pl-8">
        <p className="truncate font-heading text-sm text-foreground sm:text-base">
          Welcome, {firstName}
        </p>
        <div className="ml-auto flex items-center gap-2 pl-4">
          <ThemeToggle />
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-xs text-foreground">{firstName}</p>
            <p className="mono-label mt-1">Free plan</p>
          </div>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatar: "size-7",
                userButtonTrigger:
                  "rounded-lg border border-border p-0.5 outline-none",
              },
            }}
          />
        </div>
      </header>

      <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1560px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative min-h-60 overflow-hidden border-b border-border pb-12"
          >
            <div className="relative z-10 max-w-2xl">
              <SectionLabel>Your library</SectionLabel>
              <h1 className="mt-3 max-w-xl font-heading text-3xl leading-tight sm:text-4xl">
                {getGreeting()}, {firstName}.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Open a focused conversation, or move through your source library
                without losing the thread.
              </p>

              <Link
                href="/chat"
                className="docwise-control mt-7 flex h-12 w-full max-w-2xl items-center gap-3 px-3.5 outline-none transition-colors hover:border-foreground/20 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  Ask DocWise anything...
                </span>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
                  <ArrowRight className="size-4" />
                </span>
              </Link>
            </div>

            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 inset-y-0 hidden w-[38%] opacity-55 xl:block"
            >
              <ParticleFieldLazy
                src="/logo.png"
                sampleStep={4}
                threshold={44}
                dotSize={0.85}
                mouseForce={50}
                mouseRadius={90}
                fit="contain"
                denseParticles
              />
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="pt-10"
          >
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <SectionLabel>Recent documents</SectionLabel>
                <h2 className="mt-2 font-heading text-xl">Knowledge sources</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {documents.length} document{documents.length === 1 ? "" : "s"}{" "}
                  · {readyCount} ready
                </p>
              </div>
              <FileUpload>
                <Button variant="outline" size="lg">
                  <Upload className="size-4" />
                  <span className="hidden sm:inline">Upload</span>
                </Button>
              </FileUpload>
            </div>

            {isLoading ? (
              <DocumentGridSkeleton />
            ) : documents.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {documents.map((document) => (
                  <DocumentCard
                    key={document.fileId}
                    doc={document}
                    deleting={deletingId === document.fileId}
                    onDelete={handleDelete}
                  />
                ))}
                <UploadCard />
              </div>
            ) : (
              <div className="border border-dashed border-border">
                <EmptyState
                  icon={FileText}
                  title="Your library is ready"
                  description="Upload a source to create a searchable reading workspace."
                  action={
                    <FileUpload>
                      <Button size="lg">
                        <Upload className="size-4" />
                        Upload a document
                      </Button>
                    </FileUpload>
                  }
                />
              </div>
            )}
          </motion.section>
        </div>
      </main>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Status({ status }: { status?: string }) {
  if (status === "processing") {
    return (
      <StatusBadge>
        <Loader
          variant="dot-matrix"
          size={10}
          speed={1.2}
          label="Processing document"
        />
        Processing
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="active" dot>
      Ready
    </StatusBadge>
  );
}

function DocumentCard({
  doc,
  deleting,
  onDelete,
}: {
  doc: FileRecord;
  deleting: boolean;
  onDelete: (event: MouseEvent, fileId: string, fileName: string) => void;
}) {
  const ready = doc.status !== "processing";

  return (
    <motion.article
      whileHover={{ y: -2 }}
      className="group flex min-h-52 flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
    >
      <div className="flex items-start justify-between gap-4">
        <Status status={doc.status} />
        <div className="grid size-9 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground">
          <FileGlyph fileType={doc.fileType} />
        </div>
      </div>

      <Link
        href={`/workspace/${doc.fileId}`}
        className="mt-8 min-w-0 flex-1 outline-none"
      >
        <p className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
          {doc.fileName}
        </p>
        <p className="mono-label mt-2">{doc.fileType || "file"}</p>
      </Link>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {ready ? "Ready to chat" : "Extracting text"}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={`/workspace/${doc.fileId}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Open
            <ArrowRight className="size-3.5" />
          </Link>
          <IconButton
            onClick={(event) => onDelete(event, doc.fileId, doc.fileName)}
            disabled={deleting}
            className="size-8 hover:text-destructive"
            aria-label={`Delete ${doc.fileName}`}
            title="Delete file"
          >
            {deleting ? (
              <Loader
                variant="dot-matrix"
                size={14}
                speed={1.2}
                label={`Deleting ${doc.fileName}`}
              />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </IconButton>
        </div>
      </div>
    </motion.article>
  );
}

function FileGlyph({ fileType }: { fileType?: string }) {
  if (fileType === "audio")
    return <Music className="size-4" strokeWidth={1.6} />;
  if (fileType === "video")
    return <Video className="size-4" strokeWidth={1.6} />;
  return <FileText className="size-4" strokeWidth={1.6} />;
}

function UploadCard() {
  return (
    <FileUpload>
      <button
        type="button"
        className="group flex min-h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-5 text-center outline-none transition-colors hover:border-foreground/25 hover:bg-secondary/35 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors group-hover:text-foreground">
          <Upload className="size-4" />
        </span>
        <span>
          <span className="block text-sm font-medium text-foreground">
            Upload a document
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            PDF, audio, or video
          </span>
        </span>
      </button>
    </FileUpload>
  );
}

function DocumentGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="min-h-52 rounded-lg border border-border p-4"
        >
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
          <Skeleton className="mt-8 h-4 w-4/5" />
          <Skeleton className="mt-2 h-3 w-16" />
          <Skeleton className="mt-12 h-px w-full" />
          <Skeleton className="mt-3 h-4 w-32" />
        </div>
      ))}
    </div>
  );
}
