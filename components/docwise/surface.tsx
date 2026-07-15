import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SurfaceProps = ComponentProps<"div"> & {
  raised?: boolean;
  interactive?: boolean;
};

export function Surface({
  className,
  raised = false,
  interactive = false,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        raised ? "docwise-panel-raised" : "docwise-panel",
        interactive &&
          "transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-foreground/20 hover:bg-secondary/55",
        className,
      )}
      {...props}
    />
  );
}
