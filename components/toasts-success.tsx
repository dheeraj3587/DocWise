import { CheckIcon, XIcon } from "lucide-react";

export function SuccessToast({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex w-80 items-center gap-3 rounded-lg border border-border/70 bg-background px-3.5 py-3 shadow-lg backdrop-blur">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <CheckIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm">{title}</div>
        <p className="mt-0.5 truncate text-muted-foreground text-xs">
          {description}
        </p>
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

export function ToastsSuccessShowcasePage() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <FakeAppBackdrop />
      <div className="absolute top-6 right-6 z-50">
        <Toast />
      </div>
    </div>
  );
}

function Toast() {
  return (
    <SuccessToast
      title="Saved"
      description="Workspace settings updated."
    />
  );
}

function FakeAppBackdrop() {
  return (
    <div className="absolute inset-0 grid grid-cols-[200px_1fr] opacity-50">
      <div className="border-r border-border/40 bg-foreground/[0.02] p-4 space-y-2">
        <div className="h-3 w-24 rounded bg-foreground/10" />
        <div className="h-2 w-32 rounded bg-foreground/10" />
        <div className="h-2 w-28 rounded bg-foreground/10" />
        <div className="h-2 w-24 rounded bg-foreground/10" />
      </div>
      <div className="p-10 space-y-3">
        <div className="h-4 w-48 rounded bg-foreground/15" />
        <div className="h-2 w-72 rounded bg-foreground/10" />
        <div className="h-32 rounded-xl border border-border/40 bg-foreground/[0.02]" />
        <div className="h-32 rounded-xl border border-border/40 bg-foreground/[0.02]" />
      </div>
    </div>
  );
}
