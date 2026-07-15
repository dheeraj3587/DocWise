"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, VideoOff } from "lucide-react";

import { BrandMark } from "@/components/docwise/brand-mark";
import { EmptyState } from "@/components/docwise/empty-state";
import { IconButton } from "@/components/docwise/icon-button";

export default function VideoPage() {
  const router = useRouter();
  const [videoError, setVideoError] = useState(false);

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-3 sm:px-5">
        <IconButton
          onClick={() => router.back()}
          aria-label="Go back"
          title="Go back"
        >
          <ArrowLeft className="size-4" />
        </IconButton>
        <div className="mx-3 h-6 w-px bg-border" />
        <BrandMark />
        <span className="mono-label ml-auto">Product tour</span>
      </header>

      <main className="min-h-0 flex-1 p-3 sm:p-5">
        <div className="mx-auto h-full w-full max-w-7xl overflow-hidden rounded-lg border border-border bg-[#101010]">
          {videoError ? (
            <EmptyState
              icon={VideoOff}
              title="Video unavailable"
              description="The product tour could not be loaded."
              className="h-full"
            />
          ) : (
            <video
              src="/how-to-use.mp4"
              autoPlay
              loop
              muted
              controls
              onError={() => setVideoError(true)}
              className="h-full w-full object-contain"
            />
          )}
        </div>
      </main>
    </div>
  );
}
