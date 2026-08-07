"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes a transient popover on outside pointer-down or Escape.
 *
 * Returns the ref to attach to the popover's *outermost* element — the wrapper
 * that contains both the trigger and the floating panel — so clicking the
 * trigger to toggle it closed doesn't race the outside-click handler.
 */
export function useDismiss<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onDismiss: () => void,
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  // Keep the latest callback without re-binding listeners on every render.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(event.target as Node)) return;
      dismissRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismissRef.current();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return containerRef;
}
