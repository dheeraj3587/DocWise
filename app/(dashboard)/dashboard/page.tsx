"use client";

import Link from "next/link";
import { type MouseEvent, useState } from "react";
import { useAuth, UserButton, useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  FileText,
  Loader2,
  Music,
  Search,
  Trash2,
  Video,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
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
  const readyCount = documents.filter((doc) => doc.status !== "processing").length;
  const firstName = user?.firstName || "there";

  const deleteDocument = async (
    fileId: string,
    fileName: string,
    confirmFirst = true,
  ) => {
    if (confirmFirst && !confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setDeletingId(fileId);
    try {
      const token = await getToken();
      await deleteFile(fileId, token);
      refetch();
      showSuccessToast({
        title: "Deleted",
        description: `${fileName} was removed from your library.`,
      });
    } catch (err) {
      console.error("Delete failed:", err);
      showRetryToast({
        title: "Couldn't delete file",
        description: "The file is still in your library. Retry the delete action.",
        onRetry: () => {
          void deleteDocument(fileId, fileName, false);
        },
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = async (
    e: MouseEvent,
    fileId: string,
    fileName: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteDocument(fileId, fileName);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border py-5 pl-16 pr-6 sm:pr-10 lg:px-10">
        <span className="font-heading text-lg font-semibold">
          Welcome, {firstName}
        </span>
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

      <main className="custom-scrollbar h-[calc(100vh-73px)] overflow-auto">
        <section className="relative overflow-hidden px-6 pb-2 pt-12 sm:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute right-8 top-10 hidden size-56 opacity-70 sm:block"
          >
            <DotSphere />
          </div>

          <div className="relative z-10 max-w-[640px]">
            <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
              Your library
            </span>
            <h1 className="mt-2 font-heading text-[34px] font-semibold leading-tight">
              {getGreeting()}, {firstName}
            </h1>
            <p className="mb-6 mt-2.5 max-w-[560px] text-sm leading-relaxed text-muted-foreground">
              Ask in general, choose a document when you want context, or upload
              something new to get started.
            </p>

            <Link
              href="/chat"
              className="flex max-w-[620px] items-center gap-2.5 rounded-lg border border-border bg-background/40 py-1.5 pl-4 pr-2 transition-colors hover:border-ring"
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground/72">
                Open DocWise chat...
              </span>
              <span
                title="Open chat"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
              >
                <ArrowRight className="size-4" />
              </span>
            </Link>
          </div>
        </section>

        <section className="px-6 pb-14 pt-10 sm:px-10">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h2 className="font-heading text-xl font-semibold">
                Recent Documents
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {documents.length} document{documents.length === 1 ? "" : "s"} ·{" "}
                {readyCount} ready to chat
              </p>
            </div>
          </div>

          {isLoading ? (
            <DocumentGridSkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-[18px] min-[700px]:grid-cols-2 min-[1180px]:grid-cols-3">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.fileId}
                  doc={doc}
                  deleting={deletingId === doc.fileId}
                  onDelete={handleDelete}
                />
              ))}
              <UploadCard />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DotSphere() {
  const points = fibonacciSpherePoints(420);
  const size = 224;
  const radius = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block overflow-visible text-foreground"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {points.map((point, index) => {
        const x = radius + point.x * radius * 0.94;
        const y = radius + point.y * radius * 0.94;
        const light = (point.z + 1) / 2;
        const dotRadius = 0.55 + light * 1.45;
        const opacity = 0.12 + light * 0.64;

        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={dotRadius}
            fill="currentColor"
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function fibonacciSpherePoints(count: number) {
  const points: Array<{ x: number; y: number; z: number }> = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    points.push({ x, y, z });
  }

  return points;
}

function StatusPill({ status }: { status?: string }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Processing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-500">
      <span className="size-[5px] rounded-full bg-emerald-500" />
      Ready
    </span>
  );
}

function DocumentCard({
  doc,
  deleting,
  onDelete,
}: {
  doc: FileRecord;
  deleting: boolean;
  onDelete: (e: MouseEvent, fileId: string, fileName: string) => void;
}) {
  const ready = doc.status !== "processing";
  return (
    <div className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-background/40 p-[18px] transition-colors hover:border-ring/60">
      <div className="flex items-start justify-between">
        <StatusPill status={doc.status} />
        <div className="grid size-[38px] place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
          <FileGlyph fileType={doc.fileType} />
        </div>
      </div>

      <Link href={`/workspace/${doc.fileId}`} className="flex-1">
        <div>
          <p className="mb-2 line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {doc.fileName}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="rounded-md border border-border bg-muted px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wide">
              {doc.fileType || "file"}
            </span>
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between border-t border-border pt-3.5">
        <span className="text-xs text-muted-foreground">
          {ready ? "Ready to chat" : "Extracting text..."}
        </span>
        <div className="flex items-center gap-3">
          <Link
            href={`/workspace/${doc.fileId}`}
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground opacity-55 transition-all hover:gap-2 hover:opacity-100 group-hover:opacity-100"
          >
            Ask
            <ArrowRight className="size-3.5" />
          </Link>
          <button
            onClick={(e) => onDelete(e, doc.fileId, doc.fileName)}
            disabled={deleting}
            className="grid size-8 place-items-center rounded-lg border border-border bg-background/40 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            title="Delete file"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileGlyph({ fileType }: { fileType?: string }) {
  if (fileType === "audio") return <Music className="size-5" strokeWidth={1.6} />;
  if (fileType === "video") return <Video className="size-5" strokeWidth={1.6} />;
  return <FileText className="size-5" strokeWidth={1.6} />;
}

function UploadCard() {
  return (
    <FileUpload>
      <button
        className="group flex min-h-[176px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border p-[18px] transition-colors hover:border-ring hover:bg-background/40"
      >
        <div className="size-[52px] rounded-full border border-border bg-background/40" />
        <p className="text-sm font-semibold text-foreground">Upload a document</p>
        <p className="text-xs text-muted-foreground">
          PDF, audio, or video files
        </p>
      </button>
    </FileUpload>
  );
}

function DocumentGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-[18px] min-[700px]:grid-cols-2 min-[1180px]:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border bg-background/40 p-[18px]"
        >
          <div className="mb-8 flex items-start justify-between">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="size-[38px] rounded-lg" />
          </div>
          <Skeleton className="mb-2 h-4 w-3/4" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-8 h-px w-full" />
          <Skeleton className="mt-3 h-4 w-40" />
        </div>
      ))}
    </div>
  );
}
