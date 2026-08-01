import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

/**
 * Hairline metric tile: mono uppercase label over a font-heading value.
 * Matches the fact-card rhythm used on the onboarding "Ready" step.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card px-3 py-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="mono-label truncate">{label}</span>
        {Icon ? (
          <Icon
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.65}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="mt-2 truncate font-heading text-lg leading-none text-foreground">
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 truncate text-xs text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
