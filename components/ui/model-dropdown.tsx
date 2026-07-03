"use client";

import { useEffect, useRef, type FC, type ReactNode } from "react";
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
    <div ref={containerRef} className="w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary/45 px-2.5 text-left text-xs text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            {modelIcon(selected)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{selected.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {selected.creditCost} credit{selected.creditCost === 1 ? "" : "s"}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="mono-label">Model</span>
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
                    isSelected ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                    {modelIcon(model)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{model.name}</span>
                      {model.badge ? (
                        <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {model.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs opacity-75">{model.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-medium">
                    {model.creditCost}
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
