import { FileAudio, FileText, Film } from "lucide-react";

const SOURCE_FORMATS = [
  {
    icon: FileText,
    index: "01",
    label: "PDF",
    title: "Move through pages, not extracted blobs.",
    description:
      "DocWise keeps the document visible, organizes its topics, and returns every cited answer to the page it came from.",
  },
  {
    icon: FileAudio,
    index: "02",
    label: "Audio",
    title: "Keep the transcript tied to time.",
    description:
      "Search a recording as text, then return to the moment where the speaker actually said it.",
  },
  {
    icon: Film,
    index: "03",
    label: "Video",
    title: "Ask without losing the frame.",
    description:
      "Use the transcript for retrieval while the original recording stays close enough to inspect.",
  },
] as const;

export function SourceFormats() {
  return (
    <div className="divide-y divide-border border-y border-border">
      {SOURCE_FORMATS.map((source) => {
        const Icon = source.icon;

        return (
          <div
            key={source.label}
            className="grid gap-5 py-7 sm:grid-cols-[72px_minmax(0,1fr)] sm:py-8 lg:grid-cols-[84px_170px_minmax(0,1fr)] lg:items-start"
          >
            <div className="flex items-center gap-3 lg:block">
              <span className="font-mono text-[10px] text-muted-foreground">
                {source.index}
              </span>
              <span className="mt-0 grid size-9 place-items-center rounded-lg border border-border text-muted-foreground sm:mt-3">
                <Icon className="size-4" />
              </span>
            </div>

            <p className="font-heading text-sm uppercase text-foreground lg:pt-1">
              {source.label}
            </p>

            <div>
              <h3 className="text-lg font-medium text-foreground sm:text-xl">
                {source.title}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {source.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
