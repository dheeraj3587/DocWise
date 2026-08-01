"use client";

import { ArrowLeftIcon, HomeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function Empty404ShowcasePage() {
  const router = useRouter();

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <Grid />
      <div className="relative mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center px-6 text-center">
        <div className="mono-label mb-6">Status · 404</div>

        <BigNumerals />

        <h1 className="mt-10 max-w-md font-heading text-2xl leading-tight md:text-3xl">
          We can&apos;t find that page.
        </h1>
        <p className="mt-2 max-w-sm text-balance text-muted-foreground text-sm">
          The link may be old, or the page may have moved. Check the URL or
          head back to somewhere you know.
        </p>

        <div className="mt-8 flex items-center gap-2">
          <Button variant="outline" size="default" onClick={() => router.back()}>
            <ArrowLeftIcon />
            Go back
          </Button>
          <Button size="default" onClick={() => router.push("/")}>
            <HomeIcon />
            Take me home
          </Button>
        </div>
      </div>
    </div>
  );
}

function BigNumerals() {
  return (
    <div className="font-heading text-[clamp(8rem,22vw,16rem)] leading-none tracking-tighter text-foreground">
      404
    </div>
  );
}

function Grid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.35]"
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in srgb, var(--foreground) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 8%, transparent) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        maskImage:
          "radial-gradient(ellipse at center, black 35%, transparent 75%)",
      }}
    />
  );
}
