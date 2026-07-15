"use client";

import {
  Check,
  ChevronRight,
  FileText,
  MessageSquareText,
  PanelLeft,
  Quote,
  Search,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type PreviewMode = "read" | "ask" | "verify";

const MODES: Array<{
  id: PreviewMode;
  label: string;
  description: string;
}> = [
  {
    id: "read",
    label: "Read",
    description: "Keep the original material open and navigable.",
  },
  {
    id: "ask",
    label: "Ask",
    description: "Question the selected source without changing screens.",
  },
  {
    id: "verify",
    label: "Verify",
    description: "Return from an answer to the passage behind it.",
  },
];

const TOPICS = [
  { label: "Abstract", page: "01" },
  { label: "Architecture", page: "03" },
  { label: "Attention", page: "05" },
  { label: "Training", page: "08" },
];

export function WorkspacePreview() {
  const [mode, setMode] = useState<PreviewMode>("verify");
  const reduceMotion = useReducedMotion();
  const selectedMode = MODES.find((item) => item.id === mode) ?? MODES[0];

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="docwise-eyebrow">Product workspace</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {selectedMode.description}
          </p>
        </div>
        <div
          className="inline-flex w-fit items-center rounded-lg border border-border bg-background p-1"
          role="tablist"
          aria-label="Workspace preview mode"
        >
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={mode === item.id}
              onClick={() => setMode(item.id)}
              className={cn(
                "relative h-8 rounded-md px-4 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                mode === item.id
                  ? "text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === item.id ? (
                <motion.span
                  layoutId="workspace-preview-tab"
                  className="absolute inset-0 rounded-md bg-foreground"
                  transition={{ duration: reduceMotion ? 0 : 0.2 }}
                />
              ) : null}
              <span className="relative z-10">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-[#070708] text-[#ededed] shadow-[0_30px_90px_-44px_rgba(0,0,0,0.82)]">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="grid size-7 place-items-center rounded-md border border-white/10 text-white/60"
              aria-label="Toggle document outline"
            >
              <PanelLeft className="size-3.5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-white/90 sm:text-xs">
                attention-is-all-you-need.pdf
              </p>
              <p className="mt-0.5 font-mono text-[8px] uppercase text-white/40">
                Ready · 15 pages
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[8px] uppercase text-white/45">
              Page 5 / 15
            </span>
            <span className="grid size-7 place-items-center rounded-md border border-white/10 text-white/60">
              <Search className="size-3.5" />
            </span>
          </div>
        </div>

        <div className="grid min-h-[520px] lg:grid-cols-[210px_minmax(360px,1fr)_minmax(330px,0.72fr)]">
          <aside className="hidden border-r border-white/10 bg-[#080809] p-3 lg:block">
            <p className="px-2 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-white/38">
              In this document
            </p>
            <div className="mt-2 space-y-1">
              {TOPICS.map((topic, index) => (
                <button
                  key={topic.label}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-[11px]",
                    index === 2
                      ? "bg-white/[0.08] text-white"
                      : "text-white/45 hover:bg-white/[0.05] hover:text-white/80",
                  )}
                >
                  <span className="font-mono text-[8px] text-white/30">
                    {topic.page}
                  </span>
                  <span className="truncate">{topic.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-8 border-t border-white/10 px-2 pt-4">
              <div className="flex items-center gap-2 text-[10px] text-white/45">
                <FileText className="size-3.5" />
                <span>PDF source</span>
              </div>
            </div>
          </aside>

          <section className="relative overflow-hidden bg-[#202021] p-3 sm:p-5">
            <motion.div
              animate={
                mode === "read" && !reduceMotion
                  ? { scale: [1, 1.012, 1] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.55 }}
              className="relative mx-auto min-h-[472px] max-w-[580px] overflow-hidden bg-[#f4f4f0] px-7 py-8 text-[#171719] shadow-[0_14px_38px_rgba(0,0,0,0.28)] sm:px-12 sm:py-10"
            >
              <div className="mx-auto max-w-[430px]">
                <p className="text-center font-serif text-[11px] text-black/55">
                  Neural Information Processing Systems · 2017
                </p>
                <h3 className="mt-6 text-center font-serif text-lg font-semibold">
                  Attention Is All You Need
                </h3>
                <p className="mt-2 text-center font-serif text-[9px] text-black/50">
                  Vaswani et al.
                </p>

                <h4 className="mt-8 font-serif text-[13px] font-semibold">
                  3.2.1 Scaled Dot-Product Attention
                </h4>
                <div className="mt-3 space-y-2 font-serif text-[10px] leading-[1.55] text-black/72 sm:text-[11px]">
                  <p>
                    We call our particular attention “Scaled Dot-Product
                    Attention”. The input consists of queries and keys of
                    dimension dₖ, and values of dimension dᵥ.
                  </p>
                  <p
                    className={cn(
                      "relative -mx-2 border-l-2 px-2 py-1.5 transition-colors",
                      mode === "verify"
                        ? "border-black bg-black/[0.08]"
                        : "border-black/20",
                    )}
                  >
                    We compute the dot products of the query with all keys,
                    divide each by √dₖ, and apply a softmax function to obtain
                    the weights on the values.
                  </p>
                  <p>
                    In practice, we compute the attention function on a set of
                    queries simultaneously, packed together into a matrix Q.
                  </p>
                </div>
              </div>

              {mode === "verify" ? (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-black/55 shadow-[0_0_14px_rgba(0,0,0,0.35)]"
                  initial={{ left: "16%", opacity: 0 }}
                  animate={{ left: "84%", opacity: [0, 0.8, 0] }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                />
              ) : null}
            </motion.div>
          </section>

          <section className="flex min-h-[440px] flex-col border-t border-white/10 bg-[#09090a] lg:border-l lg:border-t-0">
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-2 text-[11px] text-white/75">
                <MessageSquareText className="size-3.5" />
                <span>Chat with this file</span>
              </div>
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/35">
                Document context
              </span>
            </div>

            <div className="flex flex-1 flex-col px-4 py-5 sm:px-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-1 flex-col"
                >
                  <div className="ml-auto max-w-[88%] rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5 text-xs leading-5 text-white/80">
                    Why is the dot product scaled before softmax?
                  </div>

                  <div className="mt-5 text-xs leading-6 text-white/72">
                    <p>
                      The scaling keeps large dot products from pushing softmax
                      into regions with extremely small gradients. Dividing by
                      √dₖ makes attention weights more stable as the key
                      dimension grows.
                    </p>
                    <button
                      type="button"
                      onClick={() => setMode("verify")}
                      className={cn(
                        "mt-4 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors",
                        mode === "verify"
                          ? "border-white/30 bg-white text-black"
                          : "border-white/12 text-white/52 hover:border-white/25 hover:text-white",
                      )}
                    >
                      <Quote className="size-3" />
                      Page 5 · §3.2.1
                      <ChevronRight className="size-3" />
                    </button>
                  </div>

                  <div className="mt-auto pt-7">
                    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
                      <div className="min-h-16 px-2 py-2 text-[11px] text-white/30">
                        Ask a follow-up about this document…
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[8px] uppercase text-white/40">
                          Source selected
                        </span>
                        <span className="grid size-7 place-items-center rounded-md bg-white text-black">
                          <ChevronRight className="size-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 font-mono text-[8px] uppercase tracking-[0.16em] text-white/32">
          <span className="inline-flex items-center gap-2">
            <Check className="size-3" />
            Original and answer in one view
          </span>
          <span className="hidden sm:inline">DocWise workspace</span>
        </div>
      </div>
    </div>
  );
}
