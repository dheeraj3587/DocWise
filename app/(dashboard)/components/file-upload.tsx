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
import { getUploadCount, uploadFile } from "@/lib/api-client";

interface UploadFile {
  file?: File;
  name: string;
  size: string;
  progress: number;
  state: "uploading" | "done" | "paused";
  kind: "image" | "doc" | "file";
}

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
    return Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length);
  }, [files]);

  const onFilesSelect = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    setFiles(Array.from(fileList).map(toUploadFile));
  };

  const onUpload = async () => {
    if (!files.length) return;
    if (remaining !== null && files.length > remaining) {
      setError(`Daily upload limit reached (${dailyLimit} files/day).`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      for (const item of files) {
        if (!item.file) continue;
        setFiles((current) =>
          current.map((f) =>
            f.name === item.name
              ? { ...f, state: "uploading", progress: Math.max(f.progress, 24) }
              : f,
          ),
        );
        await uploadFile(item.file, "", token);
        setFiles((current) =>
          current.map((f) =>
            f.name === item.name ? { ...f, state: "done", progress: 100 } : f,
          ),
        );
      }
      setLoading(false);
      setOpen(false);
      const { revalidateQueries } = await import("@/lib/hooks");
      revalidateQueries("/api/files");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("429") || msg.toLowerCase().includes("daily upload limit")) {
        setError(`Daily upload limit reached (${dailyLimit} files/day). Try again tomorrow.`);
      } else {
        setError("Upload failed. Please try again.");
      }
      setLoading(false);
    }
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
        className="w-full max-w-xl gap-0 rounded-xl border border-border bg-background p-0 shadow-2xl"
      >
        <div className="flex items-center justify-between border-border/60 border-b px-5 py-3.5">
          <DialogTitle className="font-heading text-sm">Upload documents</DialogTitle>
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
            className="block cursor-pointer rounded-xl border-2 border-dashed border-border/70 bg-background px-6 py-8 text-center transition-colors hover:border-foreground/40 hover:bg-muted/60"
          >
            <input
              type="file"
              multiple
              className="hidden"
              accept=".pdf,audio/*,video/*"
              onChange={(e) => onFilesSelect(e.target.files)}
            />
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-foreground/[0.06]">
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
                className="h-full bg-foreground"
                style={{ width: `${overall}%` }}
              />
            </div>

            <ul className="mt-4 flex flex-col gap-2.5">
              {(files.length ? files : EMPTY_FILES).map((f) => (
                <li
                  key={f.name}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2.5"
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
                            : f.state === "paused"
                              ? "bg-amber-500"
                              : "bg-foreground")
                        }
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!files.length}
                    onClick={() => setFiles((current) => current.filter((item) => item.name !== f.name))}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground disabled:pointer-events-none"
                  >
                    {f.state === "done" ? (
                      <CheckIcon className="size-3.5 text-emerald-600" />
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
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-border/60 border-t px-5 py-3">
          <Button variant="ghost" type="button" onClick={reset}>
            Cancel all
          </Button>
          <Button type="button" loading={loading} disabled={!files.length || loading} onClick={onUpload}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FILES: UploadFile[] = [
  {
    name: "lecture-notes.pdf",
    size: "PDF",
    progress: 0,
    state: "paused",
    kind: "doc",
  },
];

function toUploadFile(file: File): UploadFile {
  return {
    file,
    name: file.name,
    size: formatBytes(file.size),
    progress: 12,
    state: "uploading",
    kind: getFileKind(file),
  };
}

function getFileKind(file: File): UploadFile["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "doc";
  }
  return "file";
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function FileGlyph({ kind }: { kind: "image" | "doc" | "file" }) {
  if (kind === "image") return <ImageIcon className="size-4 opacity-70" />;
  if (kind === "doc") return <FileTextIcon className="size-4 opacity-70" />;
  return <FileIcon className="size-4 opacity-70" />;
}
