import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MeterProps = {
  /** Fill ratio expressed 0-100. Clamped internally. */
  value: number;
  label?: ReactNode;
  caption?: ReactNode;
  className?: string;
  /** Draws the fill in the destructive tone once the value crosses 90. */
  warnAtLimit?: boolean;
};

/**
 * Flat 3px usage meter. Replaces the assorted rounded-full progress tracks
 * so quota bars share the squared-off geometry of the rest of the app.
 */
export function Meter({
  value,
  label,
  caption,
  className,
  warnAtLimit = false,
}: MeterProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const atLimit = warnAtLimit && pct >= 90;

  return (
    <div className={cn("min-w-0", className)}>
      {label || caption ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {label ? <span className="mono-label truncate">{label}</span> : null}
          {caption ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {caption}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="docwise-meter"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("docwise-meter-fill", atLimit && "bg-destructive")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
