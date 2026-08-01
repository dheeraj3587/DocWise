import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "active" | "success" | "warning" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  active: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  active: "bg-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

type StatusBadgeProps = ComponentProps<"span"> & {
  tone?: Tone;
  /** Renders a 4px status dot before the label. */
  dot?: boolean;
};

/**
 * Mono uppercase metadata pill. Single source of truth for status chips so
 * surfaces stop hand-rolling their own tracking/size combinations.
 */
export function StatusBadge({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn("docwise-chip", TONE_TEXT[tone], className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn("size-1 shrink-0 rounded-full", TONE_DOT[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}
