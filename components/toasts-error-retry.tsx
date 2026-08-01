import { AlertCircleIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorRetryToast({
  title,
  description,
  code,
  retryLabel = "Retry",
  onRetry,
  onClose,
}: {
  title: string;
  description: string;
  code?: string | number;
  retryLabel?: string;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="w-96 rounded-lg border border-destructive/40 bg-popover shadow-[var(--shadow-float)]">
      <div className="flex items-start gap-3 p-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
          <AlertCircleIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm text-foreground">{title}</span>
            {code ? (
              <span className="rounded-sm border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive uppercase tracking-brand">
                {code}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
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
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Button size="sm" variant="ghost" type="button" onClick={onClose}>
          Dismiss
        </Button>
        <Button size="sm" variant="outline" type="button" onClick={onRetry}>
          <RotateCcwIcon />
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}

export function ToastsErrorRetryShowcasePage() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <FakeAppBackdrop />
      <div className="absolute top-6 right-6 z-50 w-96">
        <ErrorRetryToast
          title="Couldn't send invite"
          code="503"
          description="Email gateway is unreachable right now. We'll keep your draft — try again or write to support."
        />
      </div>
    </div>
  );
}

function FakeAppBackdrop() {
  return (
    <div className="absolute inset-0 grid grid-cols-[200px_1fr] opacity-50">
      <div className="border-r border-border bg-foreground/[0.02] p-4 space-y-2">
        <div className="h-3 w-24 rounded bg-foreground/10" />
        <div className="h-2 w-32 rounded bg-foreground/10" />
        <div className="h-2 w-28 rounded bg-foreground/10" />
      </div>
      <div className="p-10 space-y-3">
        <div className="h-4 w-48 rounded bg-foreground/15" />
        <div className="h-2 w-72 rounded bg-foreground/10" />
        <div className="h-40 rounded-lg border border-border bg-foreground/[0.02]" />
      </div>
    </div>
  );
}
