"use client";

import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type GroupProps,
  type LayoutStorage,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

/**
 * localStorage that no-ops during SSR and in privacy modes where access
 * throws. `useResizableLayout` runs during the server render pass of client
 * components, so touching `window.localStorage` directly would crash.
 */
const safeLayoutStorage: LayoutStorage = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* quota or blocked storage — layout just won't persist */
    }
  },
};

/**
 * Persists a group's layout across reloads.
 *
 * Pass `panelIds` when panels are conditionally rendered: the library keys a
 * separate saved layout per combination, so collapsing a rail doesn't
 * overwrite the sizes used when it's open.
 */
export function useResizableLayout({
  id,
  panelIds,
}: {
  id: string;
  panelIds?: string[];
}) {
  return useDefaultLayout({
    id,
    panelIds,
    storage: safeLayoutStorage,
    // Ignore layout changes from window resizes so a narrow window doesn't
    // permanently rewrite the user's chosen proportions.
    onlySaveAfterUserInteractions: true,
  });
}

export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full", className)}
      {...props}
    />
  );
}

export function ResizablePanel({ className, ...props }: PanelProps) {
  return (
    <Panel
      data-slot="resizable-panel"
      className={cn("min-w-0 overflow-hidden", className)}
      {...props}
    />
  );
}

/**
 * Hairline divider with a grip that surfaces on hover, focus, or drag.
 *
 * The rendered line stays 1px so it reads like every other divider in the app,
 * while `::before` widens the pointer target to 12px. Double-click resets the
 * neighbouring panels to their default sizes (built into the primitive).
 */
export function ResizableHandle({
  className,
  withHandle = true,
  ...props
}: SeparatorProps & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      title="Drag to resize · double-click to reset"
      className={cn(
        "group relative z-20 flex w-px shrink-0 items-center justify-center bg-border outline-none",
        "transition-colors duration-[180ms] ease-out hover:bg-foreground/25 active:bg-foreground/40",
        "focus-visible:bg-foreground/35 focus-visible:ring-1 focus-visible:ring-ring",
        // Vertical groups hand the separator aria-orientation="horizontal".
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full",
        // Widened invisible hit area.
        "before:absolute before:inset-y-0 before:-left-1.5 before:w-3",
        "aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:-top-1.5 aria-[orientation=horizontal]:before:h-3 aria-[orientation=horizontal]:before:w-auto",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <span
          aria-hidden
          className={cn(
            "relative z-10 grid h-8 w-3 shrink-0 place-items-center rounded-sm border border-border bg-card text-muted-foreground",
            "opacity-0 transition-opacity duration-[180ms] ease-out",
            "group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100",
            "group-aria-[orientation=horizontal]:h-3 group-aria-[orientation=horizontal]:w-8",
          )}
        >
          <GripVertical className="size-2.5 group-aria-[orientation=horizontal]:rotate-90" />
        </span>
      ) : null}
    </Separator>
  );
}
