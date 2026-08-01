"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { StatusBadge } from "@/components/docwise/status-badge";
import {
  DropdownDisclosure,
  DropdownDisclosureBody,
  DropdownDisclosureContent,
  DropdownDisclosureDescription,
  DropdownDisclosureHeader,
  DropdownDisclosureTitle,
  DropdownDisclosureTrigger,
} from "@/components/ui/dropdown-disclosure";
import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  creditCost: number;
  reasoning: boolean;
  provider?: string;
  providerLabel?: string;
  badge?: string | null;
  contextWindow: number;
  outputReserveTokens: number;
  toolCalling: boolean;
  agentToolsEnabled: boolean;
}

type ModelGlyphSize = "sm" | "md" | "lg";

const GLYPH_SIZE: Record<ModelGlyphSize, string> = {
  sm: "size-5 rounded-md [&_svg]:size-3",
  md: "size-7 rounded-lg [&_svg]:size-4",
  lg: "size-11 rounded-lg [&_svg]:size-6",
};

export function ModelGlyph({
  modelId,
  size = "md",
  className,
}: {
  modelId?: string | null;
  size?: ModelGlyphSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center border border-border bg-background text-foreground",
        GLYPH_SIZE[size],
        modelId === "gpt-oss-120b" && "bg-foreground text-background",
        modelId === "gemma-4-31b" && "bg-secondary",
        modelId === "zai-glm-4.7" && "bg-foreground/[0.06]",
        modelId === "tencent/hy3:free" && "bg-secondary/70",
        className,
      )}
    >
      <ModelGlyphArt modelId={modelId} />
    </span>
  );
}

function ModelGlyphArt({ modelId }: { modelId?: string | null }) {
  if (modelId === "gpt-oss-120b") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="2.3" />
        <path d="M12 3.5v3.2M12 17.3v3.2M3.5 12h3.2M17.3 12h3.2M6 6l2.3 2.3M15.7 15.7 18 18M18 6l-2.3 2.3M8.3 15.7 6 18" />
        <circle cx="12" cy="12" r="6.1" strokeOpacity=".55" />
      </svg>
    );
  }

  if (modelId === "gemma-4-31b") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
        <path
          d="m18.5 4.5.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9L16 7l1.9-.6.6-1.9Z"
          strokeOpacity=".6"
        />
      </svg>
    );
  }

  if (modelId === "zai-glm-4.7") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="7" r="2" />
        <circle cx="8" cy="18" r="2" />
        <circle cx="17" cy="17" r="2" />
        <path
          d="m7.8 6.3 8.2.5M7.1 7.7l-1 8.4M16.7 8.8l.2 6.2M9.8 17.8l5.2-.5M8 7.2l7.5 8.4"
          strokeOpacity=".75"
        />
      </svg>
    );
  }

  if (modelId === "tencent/hy3:free") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(30 12 12)" />
        <ellipse
          cx="12"
          cy="12"
          rx="9"
          ry="4.2"
          transform="rotate(-30 12 12)"
          strokeOpacity=".65"
        />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 2.5v2.2M21.5 12h-2.2M12 21.5v-2.2M2.5 12h2.2" />
    </svg>
  );
}

interface ModelSelectorProps extends Omit<
  ComponentProps<"button">,
  "onChange"
> {
  models: ModelOption[];
  selectedModelId: string;
  selectedCreditCost: number;
  open: boolean;
  compact?: boolean;
  onOpenChange: (open: boolean) => void;
  onModelChange: (model: ModelOption) => void;
}

export function ModelSelector({
  models,
  selectedModelId,
  selectedCreditCost,
  open,
  compact = false,
  disabled,
  className,
  onOpenChange,
  onModelChange,
  ...triggerProps
}: ModelSelectorProps) {
  const selected =
    models.find((model) => model.id === selectedModelId) ?? models[0];

  if (!selected) return null;

  const creditAdjustment = Math.max(
    0,
    selectedCreditCost - selected.creditCost,
  );

  return (
    <DropdownDisclosure open={open} onOpenChange={onOpenChange}>
      <DropdownDisclosureTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Choose model. Current model: ${selected.name}`}
          className={cn(
            "group inline-flex items-center rounded-lg border border-border bg-card text-left text-foreground outline-none transition-colors hover:border-foreground/20 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            compact
              ? "h-8 min-w-0 max-w-[178px] gap-2 px-2"
              : "h-9 min-w-[180px] max-w-[244px] gap-2.5 px-2.5",
            className,
          )}
          {...triggerProps}
        >
          <ModelGlyph modelId={selected.id} size={compact ? "sm" : "md"} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium leading-tight">
              {selected.name}
            </span>
            {!compact ? (
              <span className="mt-0.5 block truncate font-mono text-[9px] uppercase leading-none tracking-label text-muted-foreground">
                {selected.providerLabel ?? selected.provider ?? "Model"}
              </span>
            ) : null}
          </span>
          {!compact ? (
            <span className="hidden shrink-0 font-mono text-[9px] text-muted-foreground sm:block">
              {selectedCreditCost} cr
            </span>
          ) : null}
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </DropdownDisclosureTrigger>

      <DropdownDisclosureContent aria-describedby="model-selector-description">
        <DropdownDisclosureHeader>
          <DropdownDisclosureTitle>Choose model</DropdownDisclosureTitle>
          <DropdownDisclosureDescription id="model-selector-description">
            Select the model that best matches this conversation.
          </DropdownDisclosureDescription>
        </DropdownDisclosureHeader>
        <DropdownDisclosureBody className="p-2.5 sm:p-3">
          <div
            role="radiogroup"
            aria-label="Available chat models"
            className="grid gap-1.5"
          >
            {models.map((model) => {
              const active = model.id === selected.id;
              const creditCost = model.creditCost + creditAdjustment;

              return (
                <button
                  key={model.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    onModelChange(model);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:gap-4 sm:px-4 sm:py-3.5",
                    active
                      ? "border-foreground/16 bg-secondary text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/55 hover:text-foreground",
                  )}
                >
                  <ModelGlyph modelId={model.id} size="lg" />
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate font-heading text-[13px] leading-tight text-foreground sm:text-sm">
                        {model.name}
                      </span>
                      {model.badge ? (
                        <StatusBadge tone={active ? "active" : "neutral"}>
                          {model.badge}
                        </StatusBadge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
                      {model.description}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-label text-muted-foreground">
                      <span>
                        {model.providerLabel ?? model.provider ?? "Provider"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {creditCost} credit{creditCost === 1 ? "" : "s"}
                      </span>
                      {creditAdjustment > 0 ? <span>with tools</span> : null}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      active
                        ? "border-foreground bg-foreground"
                        : "border-border bg-background",
                    )}
                  >
                    {active ? (
                      <span className="size-1.5 rounded-full bg-background" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </DropdownDisclosureBody>
      </DropdownDisclosureContent>
    </DropdownDisclosure>
  );
}
