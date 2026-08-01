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
    <div className="flex w-80 items-center gap-3 rounded-lg border border-border bg-popover px-3.5 py-3 shadow-[var(--shadow-float)]">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-success">
        <CheckIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-sm text-foreground">{title}</div>
        <p className="mt-1 truncate text-muted-foreground text-xs">
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
      <div className="border-r border-border bg-foreground/[0.02] p-4 space-y-2">
        <div className="h-3 w-24 rounded bg-foreground/10" />
        <div className="h-2 w-32 rounded bg-foreground/10" />
        <div className="h-2 w-28 rounded bg-foreground/10" />
        <div className="h-2 w-24 rounded bg-foreground/10" />
      </div>
      <div className="p-10 space-y-3">
        <div className="h-4 w-48 rounded bg-foreground/15" />
        <div className="h-2 w-72 rounded bg-foreground/10" />
        <div className="h-32 rounded-lg border border-border bg-foreground/[0.02]" />
        <div className="h-32 rounded-lg border border-border bg-foreground/[0.02]" />
      </div>
    </div>
  );
}
