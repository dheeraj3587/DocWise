"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import Link from "next/link";
import { arc } from "motion";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type BounceSidebarItem =
  | string
  | {
      label: string;
      href?: string;
      meta?: string;
      description?: string;
    };

export type BounceSidebarProps = Omit<ComponentProps<"ul">, "onChange"> & {
  items: BounceSidebarItem[];
  value?: number;
  defaultValue?: number;
  onChange?: (index: number) => void;
  dotColor?: string;
};

export function BounceSidebar({
  items,
  value,
  defaultValue = 0,
  onChange,
  dotColor = "currentColor",
  className,
  ...props
}: BounceSidebarProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeIndex = Math.max(
    0,
    Math.min(value ?? internalValue, Math.max(0, items.length - 1)),
  );
  const reduceMotion = useReducedMotion();
  const [dot, animate] = useAnimate<HTMLSpanElement>();
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const previousY = useRef<number | null>(null);
  const dotSize = 6;
  const [ready, setReady] = useState(false);

  useIsomorphicLayoutEffect(() => {
    let cancelled = false;
    const snap = () => {
      const element = itemRefs.current[activeIndex];
      if (cancelled || !element || !dot.current) return;
      const dpr = window.devicePixelRatio || 1;
      const size = Math.round(6 * dpr) / dpr;
      const toY =
        Math.round(
          (element.offsetTop + element.offsetHeight / 2 - size / 2) * dpr,
        ) / dpr;
      void animate(dot.current, { x: 0, y: toY }, { duration: 0 });
      previousY.current = toY;
      setReady(true);
    };

    snap();
    const frame = requestAnimationFrame(snap);
    void document.fonts?.ready.then(snap);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [activeIndex, animate, dot]);

  useEffect(() => {
    const element = itemRefs.current[activeIndex];
    if (!element || !dot.current) return;

    const dpr = window.devicePixelRatio || 1;
    const toY =
      Math.round(
        (element.offsetTop + element.offsetHeight / 2 - dotSize / 2) * dpr,
      ) / dpr;

    if (previousY.current === null) {
      void animate(dot.current, { x: 0, y: toY }, { duration: 0 });
      previousY.current = toY;
      return;
    }

    const fromY = previousY.current;
    const delta = toY - fromY;
    previousY.current = toY;
    if (delta === 0) return;

    const distance = Math.abs(delta);
    const path = arc({
      strength: Math.min(0.8, 14 / distance),
      direction: delta > 0 ? "ccw" : "cw",
    });

    void animate(
      dot.current,
      { x: 0, y: toY },
      {
        duration: reduceMotion ? 0 : 0.25,
        ease: "easeOut",
        path,
      },
    );
  }, [activeIndex, animate, dot, dotSize, reduceMotion]);

  const select = (index: number) => {
    if (value === undefined) setInternalValue(index);
    onChange?.(index);
  };

  return (
    <ul
      data-slot="bounce-sidebar"
      className={cn(
        "relative flex flex-col gap-1 pl-6 text-foreground",
        className,
      )}
      {...props}
    >
      <span
        ref={dot}
        aria-hidden
        className="absolute left-2 top-0 rounded-full transition-opacity duration-150"
        style={{
          width: dotSize,
          height: dotSize,
          backgroundColor: dotColor,
          opacity: ready ? 1 : 0,
        }}
      />

      {items.map((item, index) => {
        const label = typeof item === "string" ? item : item.label;
        const href = typeof item === "string" ? undefined : item.href;
        const meta = typeof item === "string" ? undefined : item.meta;
        const description =
          typeof item === "string" ? undefined : item.description;
        const isActive = index === activeIndex;
        const itemClassName = cn(
          "group flex w-full cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-[background-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        );
        const content = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-5">
                {label}
              </span>
              {description ? (
                <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {description}
                </span>
              ) : null}
            </span>
            {meta ? (
              <span className="mono-label shrink-0 pt-1 text-[10px]">
                {meta}
              </span>
            ) : null}
          </>
        );

        return (
          <li
            key={`${label}-${index}`}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
          >
            {href ? (
              <MotionLink
                href={href}
                data-slot="bounce-sidebar-item"
                data-active={isActive}
                onClick={() => select(index)}
                className={itemClassName}
              >
                {content}
              </MotionLink>
            ) : (
              <motion.button
                type="button"
                data-slot="bounce-sidebar-item"
                data-active={isActive}
                onClick={() => select(index)}
                className={itemClassName}
              >
                {content}
              </motion.button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
