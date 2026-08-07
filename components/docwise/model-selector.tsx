"use client";

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
  /**
   * Effort levels this model honours, in display order. Empty means it can
   * think but has no dial, so the Think control must stay a plain on/off.
   */
  reasoningEfforts?: ReasoningEffort[];
}

export type ReasoningEffort = "low" | "medium" | "high";

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
        modelId === "tencent/hy3" && "bg-secondary/70",
        modelId?.startsWith("nvidia/") && "bg-foreground/[0.06]",
        modelId?.startsWith("poolside/") && "bg-secondary",
        modelId?.startsWith("cohere/") && "bg-secondary/70",
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

  if (modelId === "tencent/hy3") {
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

  if (modelId?.startsWith("nvidia/")) {
    // Stacked layers — the MoE "many experts, few active" idea.
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <path d="M12 3 21 7.5 12 12 3 7.5 12 3Z" />
        <path d="m3 12 9 4.5 9-4.5" strokeOpacity=".7" />
        <path d="m3 16.5 9 4.5 9-4.5" strokeOpacity=".45" />
      </svg>
    );
  }

  if (modelId?.startsWith("poolside/") || modelId?.startsWith("cohere/")) {
    // Angle brackets — these are the coding-agent models.
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4" />
        <path d="M13.5 5 10.5 19" strokeOpacity=".6" />
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
