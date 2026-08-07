"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

export const PdfViewer = ({
  fileUrl,
  page = 1,
}: {
  fileUrl: string;
  page?: number;
}) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Jump to a page by rewriting only the fragment. Keying the iframe on `src`
  // used to remount it on every citation click, re-downloading the whole PDF.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const next = `${fileUrl}#toolbar=0&navpanes=0&page=${page}`;
    if (frame.src !== next) frame.src = next;
  }, [fileUrl, page]);

  return (
    <main className="relative flex h-full min-w-0 flex-col bg-stage p-2 sm:p-3">
      <iframe
        ref={frameRef}
        key={fileUrl}
        title="PDF Viewer"
        onLoad={() => setLoaded(true)}
        className="h-full w-full rounded-lg border border-border bg-stage"
      />

      {/* Mobile Safari and some embedded browsers refuse to render PDFs in an
          iframe and leave it blank, with no error to catch. Always offer a way out. */}
      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-5 right-5 flex items-center gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 text-[12px] text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
      >
        <ExternalLink className="size-3.5" strokeWidth={1.75} />
        {loaded ? "Open in new tab" : "PDF not showing? Open it here"}
      </a>
    </main>
  );
};
