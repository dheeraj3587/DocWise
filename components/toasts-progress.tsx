import { useEffect, useState } from "react";
import { FileIcon, FileTextIcon, ImageIcon, XIcon } from "lucide-react";

export interface ProgressToastJob {
  id: number | string;
  name: string;
  size: string;
  kind: "image" | "doc" | "file";
  progress: number;
  actionLabel?: string;
  onAction?: () => void;
}

export function ProgressToast({
  jobs,
  title,
  onClose,
}: {
  jobs: ProgressToastJob[];
  title?: string;
  onClose?: () => void;
}) {
  const total = jobs.length;
  const done = jobs.filter((j) => j.progress >= 100).length;

  return (
    <div className="w-96 rounded-lg border border-border bg-popover shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-1.5 animate-pulse rounded-full bg-foreground" />
          <span className="font-heading text-sm text-foreground">
            {title ?? `Uploading ${done} of ${total}`}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-[180ms] hover:bg-secondary hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <ul className="divide-y divide-border">
        {jobs.map((j) => (
          <li key={j.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-secondary">
              {j.kind === "image" ? (
                <ImageIcon className="size-3.5 opacity-70" />
              ) : j.kind === "doc" ? (
                <FileTextIcon className="size-3.5 opacity-70" />
              ) : (
                <FileIcon className="size-3.5 opacity-70" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-sm">{j.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {Math.round(j.progress)}%
                </span>
              </div>
              <div className="docwise-meter mt-1.5">
                <div
                  className="docwise-meter-fill"
                  style={{ width: `${j.progress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-muted-foreground text-xs">
                <span>{j.size}</span>
                {j.actionLabel ? (
                  <button
                    type="button"
                    onClick={j.onAction}
                    className="font-mono text-[10px] uppercase tracking-brand transition-colors hover:text-foreground"
                  >
                    {j.actionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ToastsProgressShowcasePage() {
  const [jobs, setJobs] = useState<ProgressToastJob[]>([
    { id: 1, name: "preview-render-4k.png", size: "8.1 MB", kind: "image", progress: 28 },
    { id: 2, name: "Q3-roadmap.pdf", size: "684 KB", kind: "doc", progress: 62 },
  ]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setJobs((js) =>
        js.map((j) => ({
          ...j,
          progress: Math.min(100, j.progress + Math.random() * 4),
        })),
      );
    }, 600);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <FakeAppBackdrop />
      <div className="absolute right-6 bottom-6 z-50">
        <ProgressToast jobs={jobs} />
      </div>
    </div>
  );
}

function FakeAppBackdrop() {
  return (
    <div className="absolute inset-0 p-10 opacity-50 space-y-3">
      <div className="h-4 w-48 rounded bg-foreground/15" />
      <div className="h-2 w-72 rounded bg-foreground/10" />
      <div className="h-40 rounded-lg border border-border bg-foreground/[0.02]" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 rounded-lg border border-border bg-foreground/[0.02]"
          />
        ))}
      </div>
    </div>
  );
}
