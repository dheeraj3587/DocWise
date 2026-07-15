import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "min-h-72 px-6 py-14",
        className,
      )}
    >
      <div className="grid size-10 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.65} />
      </div>
      <h3 className="mt-5 font-heading text-lg leading-snug text-foreground">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
