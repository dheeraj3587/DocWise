import { ArrowUpRight, FileText, Quote } from "lucide-react";

export function ConversationPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border">
            <FileText className="size-3.5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              attention-is-all-you-need.pdf
            </p>
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Conversation · 2 turns
            </p>
          </div>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-label text-muted-foreground sm:inline">
          Document context
        </span>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="ml-auto max-w-[82%] rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground">
          Why scale the dot product before softmax?
        </div>

        <div className="max-w-[92%] text-sm leading-6 text-muted-foreground">
          <p>
            Larger key dimensions produce larger dot products. Scaling them
            keeps softmax from becoming too sharp and helps preserve useful
            gradients during training.
          </p>
          <span className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-brand text-foreground">
            <Quote className="size-3" />
            Page 5 · §3.2.1
          </span>
        </div>

        <div className="ml-auto max-w-[82%] rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground">
          And what problem would appear without it?
        </div>

        <div className="max-w-[92%] border-l border-foreground/30 pl-4 text-sm leading-6 text-foreground">
          Softmax would place almost all weight on a few positions. The paper
          notes that this leaves extremely small gradients, making attention
          harder to train as the dimension grows.
          <button
            type="button"
            className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Open the supporting passage
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
