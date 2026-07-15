"use client";

import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full", className)}
      {...props}
    />
  );
}

export function ResizablePanel(props: PanelProps) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

export function ResizableHandle({
  className,
  withHandle = false,
  ...props
}: SeparatorProps & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "group relative z-20 flex w-px shrink-0 items-center justify-center bg-border outline-none transition-colors hover:bg-foreground/25 focus-visible:bg-foreground/35 focus-visible:ring-1 focus-visible:ring-ring aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full",
        "before:absolute before:inset-y-0 before:-left-1.5 before:w-3 aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:-top-1.5 aria-[orientation=horizontal]:before:h-3 aria-[orientation=horizontal]:before:w-auto",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <span className="relative z-10 grid h-8 w-3 place-items-center rounded-sm border border-border bg-background text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <GripVertical className="size-2.5" />
        </span>
      ) : null}
    </Separator>
  );
}
