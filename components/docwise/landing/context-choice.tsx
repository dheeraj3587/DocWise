"use client";

import { FileText, Globe2, LockKeyhole } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type ContextMode = "general" | "documents";

export function ContextChoice() {
  const [mode, setMode] = useState<ContextMode>("documents");
  const reduceMotion = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="docwise-eyebrow">Context for this chat</span>
        <LockKeyhole className="size-3.5 text-muted-foreground" />
      </div>
      <div className="p-4 sm:p-5">
        <div className="inline-flex items-center rounded-lg border border-border p-1">
          {([
            ["general", "General", Globe2],
            ["documents", "Documents", FileText],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                "relative inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium",
                mode === id
                  ? "text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === id ? (
                <motion.span
                  layoutId="context-choice-tab"
                  className="absolute inset-0 rounded-md bg-foreground"
                  transition={{ duration: reduceMotion ? 0 : 0.2 }}
                />
              ) : null}
              <Icon className="relative z-10 size-3.5" />
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>

        <motion.div
          key={mode}
          initial={reduceMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 min-h-24 border-t border-border pt-5"
        >
          <p className="text-sm font-medium text-foreground">
            {mode === "documents"
              ? "Use only the file you selected"
              : "Chat without opening your library"}
          </p>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {mode === "documents"
              ? "DocWise retrieves from the active document and keeps its source location available beside the answer."
              : "Uploaded files stay out of the prompt until you deliberately switch document context on."}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
