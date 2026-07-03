"use client";

import { useEffect, useRef, type FC, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import useMeasure from "react-use-measure";
import { Brain, Check, ChevronDown, CircleGauge, FileSearch, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  creditCost: number;
  reasoning: boolean;
  badge?: string | null;
}

interface ModelDropdownProps {
  models: ModelOption[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedModelId: string;
  onModelChange: (model: ModelOption) => void;
  disabled?: boolean;
}

function modelIcon(model: ModelOption): ReactNode {
  if (model.reasoning) return <Brain className="h-4 w-4" />;
  if (model.id.includes("gemma")) return <FileSearch className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

export const ModelDropdown: FC<ModelDropdownProps> = ({
  models,
  isOpen,
  onOpenChange,
  selectedModelId,
  onModelChange,
  disabled = false,
}) => {
  const selected = models.find((model) => model.id === selectedModelId) || models[0];
  const [measureRef, bounds] = useMeasure({ offsetSize: true });
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onOpenChange]);

  if (!selected) return null;

  return (
    <MotionConfig transition={{ type: "spring", stiffness: 260, damping: 28 }}>
      <motion.div
        ref={containerRef}
        animate={{
          width: bounds.width > 0 ? bounds.width : "auto",
          height: bounds.height > 0 ? bounds.height : "auto",
        }}
        className="relative z-30 overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-lg shadow-black/20 backdrop-blur-md"
      >
        <div ref={measureRef} className="shrink-0 p-1.5">
          <AnimatePresence mode="popLayout" initial={false}>
            {!isOpen ? (
              <motion.button
                key="trigger"
                type="button"
                disabled={disabled}
                onClick={() => onOpenChange(true)}
                className="flex h-9 min-w-[168px] items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    {modelIcon(selected)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{selected.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {selected.creditCost} credit{selected.creditCost === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </motion.button>
            ) : (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="w-[292px]"
              >
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Model
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CircleGauge className="h-3 w-3" />
                    Daily credits
                  </span>
                </div>
                <div className="space-y-1">
                  {models.map((model) => {
                    const isSelected = model.id === selected.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          onModelChange(model);
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                            isSelected
                              ? "border-accent-foreground/20 bg-accent-foreground/10"
                              : "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {modelIcon(model)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{model.name}</span>
                            {model.badge && (
                              <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium">
                                {model.badge}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs opacity-75">{model.description}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold">
                          {model.creditCost}
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </MotionConfig>
  );
};
