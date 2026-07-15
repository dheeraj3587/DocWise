"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  CloudUploadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  PauseIcon,
  XIcon,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getFileProgress, getUploadCount, uploadFile } from "@/lib/api-client";
import type { ProgressToastJob } from "@/components/toasts-progress";
import {
  dismissToast,
  showProgressToast,
  showRetryToast,
  showSuccessToast,
} from "@/lib/app-toasts";

interface UploadFile {
  file?: File;
  name: string;
  size: string;
  progress: number;
  state: "uploading" | "done" | "paused" | "failed";
  kind: "image" | "doc" | "file";
  phase?: string;
}

const UPLOAD_TOAST_ID = "docwise-upload-progress";

export function FileUpload({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState(5);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const token = await getToken();
        const data = await getUploadCount(token);
        setRemaining(data.remaining);
        setDailyLimit(data.limit);
      } catch {
        setRemaining(null);
      }
    })();
  }, [open, getToken]);

  const done = files.filter((f) => f.state === "done").length;
  const total = files.length;
  const overall = useMemo(() => {
    if (!files.length) return 0;
    return Math.round(
      files.reduce((acc, f) => acc + f.progress, 0) / files.length,
    );
  }, [files]);

  const onFilesSelect = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    setFiles(Array.from(fileList).map(toUploadFile));
  };

  const onUpload = async () => {
    if (!files.length) return;
    if (remaining !== null && files.length > remaining) {
      const message = `Daily upload limit reached (${dailyLimit} files/day).`;
      setError(message);
      showRetryToast({
        title: "Upload limit reached",
        description: message,
        retryLabel: "Dismiss",
      });
      return;
    }

    setLoading(true);
    setError(null);
    showProgress(
      files.map((file) => ({ ...file, progress: 0, phase: "Waiting" })),
    );
    try {
      const token = await getToken();
      for (const item of files) {
        if (!item.file) continue;
        updateFileProgress(item.name, {
          state: "uploading",
          progress: 0,
          phase: "Uploading",
        });
        const uploaded = await uploadFile(
          item.file,
          "",
          token,
          (uploadProgress) => {
            updateFileProgress(item.name, {
              state: "uploading",
              progress: Math.round(uploadProgress * 0.45),
              phase: "Uploading",
            });
          },
        );
        await pollProcessingProgress(uploaded.fileId, item.name, token);
      }
      setLoading(false);
      setOpen(false);
      dismissToast(UPLOAD_TOAST_ID);
      showSuccessToast({
        title: "Upload complete",
        description: `${files.length} file${files.length === 1 ? "" : "s"} processed and ready.`,
      });
      const { revalidateQueries } = await import("@/lib/hooks");
      revalidateQueries("/api/files");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      dismissToast(UPLOAD_TOAST_ID);
      if (
        msg.includes("429") ||
        msg.toLowerCase().includes("daily upload limit")
      ) {
        const message = `Daily upload limit reached (${dailyLimit} files/day). Try again tomorrow.`;
        setError(message);
        showRetryToast({
          title: "Upload limit reached",
          description: message,
          retryLabel: "Dismiss",
        });
      } else {
        const message = "Upload failed. Please try again.";
        setError(message);
        showRetryToast({
          title: "Upload failed",
          description:
            "The upload or processing job did not finish. Try again with the same files.",
          onRetry: () => {
            void onUpload();
          },
        });
      }
      setLoading(false);
    }
  };

  const updateFileProgress = (
    fileName: string,
    update: Partial<Pick<UploadFile, "progress" | "state" | "phase">>,
  ) => {
    setFiles((current) => {
      const next = current.map((file) =>
        file.name === fileName
          ? {
              ...file,
              ...update,
              progress: Math.max(
                0,
                Math.min(100, update.progress ?? file.progress),
              ),
            }
          : file,
      );
      showProgress(next);
      return next;
    });
  };

  const pollProcessingProgress = async (
    fileId: string,
    fileName: string,
    token?: string | null,
  ) => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const progress = await getFileProgress(fileId, token);
      const backendProgress = Math.max(
        0,
        Math.min(100, Number(progress.progress) || 0),
      );
      const combinedProgress =
        progress.status === "ready"
          ? 100
          : Math.min(99, 45 + Math.round(backendProgress * 0.55));

      updateFileProgress(fileName, {
        state: progress.status === "failed" ? "failed" : "uploading",
        progress: combinedProgress,
        phase: progress.phase || "Processing",
      });

      if (progress.status === "ready") {
        updateFileProgress(fileName, {
          state: "done",
          progress: 100,
          phase: "Ready",
        });
        return;
      }

      if (progress.status === "failed") {
        throw new Error("Processing failed");
      }

      await sleep(1500);
    }

    throw new Error("Processing timed out");
  };

  const showProgress = (items: UploadFile[]) => {
    showProgressToast({
      id: UPLOAD_TOAST_ID,
      title: `Uploading ${items.filter((item) => item.state === "done").length} of ${items.length}`,
      jobs: items.map(toProgressToastJob),
    });
  };

  const reset = () => {
    setFiles([]);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-xl gap-0 rounded-lg border border-border bg-background p-0 shadow-2xl"
      >
        <div className="flex items-center justify-between border-border/60 border-b px-5 py-3.5">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.26em] text-muted-foreground">
              Add sources
            </div>
            <DialogTitle className="mt-1 font-heading text-base">
              Upload documents
            </DialogTitle>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFilesSelect(e.dataTransfer.files);
            }}
            className="block cursor-pointer rounded-lg border border-dashed border-border bg-background px-6 py-9 text-center outline-none transition-colors hover:border-foreground/30 hover:bg-secondary/35 focus-within:ring-2 focus-within:ring-ring"
          >
            <input
              type="file"
              multiple
              className="hidden"
              accept=".pdf,audio/*,video/*"
              onChange={(e) => onFilesSelect(e.target.files)}
            />
            <div className="mx-auto flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
              <CloudUploadIcon className="size-5 opacity-70" />
            </div>
            <div className="mt-3 text-sm">
              Drag and drop files here, or{" "}
              <span className="text-foreground underline-offset-2 hover:underline">
                browse
              </span>
            </div>
            <div className="mt-1 text-muted-foreground text-xs">
              PDF, audio, or video files for DocWise
            </div>
          </label>

          {files.length ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
                  {done} of {Math.max(total, 1)} complete
                </div>
                <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
                  {overall}%
                </div>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground transition-[width] duration-200"
                  style={{ width: `${overall}%` }}
                />
              </div>

              <ul className="mt-4 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                {files.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center gap-3 rounded-lg border border-border bg-secondary/35 px-3 py-2.5"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06]">
                      <FileGlyph kind={f.kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm">{f.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {f.size}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={
                            "h-full " +
                            (f.state === "done"
                              ? "bg-emerald-500"
                              : f.state === "failed"
                                ? "bg-destructive"
                                : "bg-foreground")
                          }
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!files.length}
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((item) => item.name !== f.name),
                        )
                      }
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground disabled:pointer-events-none"
                    >
                      {f.state === "done" ? (
                        <CheckIcon className="size-3.5 text-emerald-600" />
                      ) : f.state === "failed" ? (
                        <XIcon className="size-3.5 text-destructive" />
                      ) : f.state === "paused" ? (
                        <PauseIcon className="size-3.5" />
                      ) : (
                        <XIcon className="size-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {remaining !== null ? (
                <div className="mt-3 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
                  {remaining} upload{remaining === 1 ? "" : "s"} remaining today
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-border/60 border-t px-5 py-3">
          <Button
            variant="ghost"
            type="button"
            onClick={reset}
            disabled={!files.length}
          >
            Clear
          </Button>
          <Button
            type="button"
            loading={loading}
            disabled={!files.length || loading}
            onClick={onUpload}
          >
            Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toUploadFile(file: File): UploadFile {
  return {
    file,
    name: file.name,
    size: formatBytes(file.size),
    progress: 0,
    state: "paused",
    phase: "Queued",
    kind: getFileKind(file),
  };
}

function toProgressToastJob(file: UploadFile): ProgressToastJob {
  return {
    id: file.name,
    name: file.name,
    size: file.phase ? `${file.size} · ${file.phase}` : file.size,
    progress: file.progress,
    kind: file.kind,
  };
}

function getFileKind(file: File): UploadFile["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    return "doc";
  }
  return "file";
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function FileGlyph({ kind }: { kind: "image" | "doc" | "file" }) {
  if (kind === "image") return <ImageIcon className="size-4 opacity-70" />;
  if (kind === "doc") return <FileTextIcon className="size-4 opacity-70" />;
  return <FileIcon className="size-4 opacity-70" />;
}
