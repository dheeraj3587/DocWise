import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function SectionLabel({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "docwise-eyebrow inline-flex items-center gap-2",
        className,
      )}
      {...props}
    />
  );
}
