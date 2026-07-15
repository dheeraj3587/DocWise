"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  Check,
  FileAudio,
  FileText,
  Film,
  MessageSquareText,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { BrandMark } from "@/components/docwise/brand-mark";
import { ContextChoice } from "@/components/docwise/landing/context-choice";
import { ConversationPreview } from "@/components/docwise/landing/conversation-preview";
import { Reveal } from "@/components/docwise/landing/reveal";
import { SourceFormats } from "@/components/docwise/landing/source-formats";
import { WorkspacePreview } from "@/components/docwise/landing/workspace-preview";
import { ParticleFieldLazy } from "@/components/particle-field-lazy";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useUserSync } from "@/lib/use-user-sync";

const NAV_ITEMS = [
  { href: "#workspace", label: "Workspace" },
  { href: "#sources", label: "Sources" },
  { href: "#context", label: "Context" },
] as const;

const SOURCE_LABELS = [
  { icon: FileText, label: "PDF" },
  { icon: FileAudio, label: "Audio" },
  { icon: Film, label: "Video" },
] as const;

export default function HomeClient() {
  const { user } = useUser();
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  useUserSync();

  const handleGetStarted = useCallback(() => {
    router.push(user ? "/dashboard" : "/signup");
  }, [router, user]);

  const scrollToId = useCallback(
    (id: string) => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    },
    [reduceMotion],
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/72">
        <nav className="mx-auto flex h-14 w-full max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandMark href="/" />

          <div className="hidden items-center gap-6 md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {!user ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => router.push("/login")}
                >
                  Log in
                </Button>
                <Button size="sm" onClick={() => router.push("/signup")}>
                  Get started
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => router.push("/dashboard")}>
                  Dashboard
                </Button>
                <UserButton />
              </>
            )}
          </div>
        </nav>
      </header>

      <section className="relative flex min-h-[74svh] items-center overflow-hidden border-b border-border px-4 py-16 sm:min-h-[78svh] sm:px-6 sm:py-20 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-38 dark:opacity-48"
        >
          <ParticleFieldLazy
            src="/logo.png"
            sampleStep={3}
            threshold={38}
            dotSize={0.9}
            mouseForce={72}
            mouseRadius={120}
            denseParticles
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-background/70 dark:bg-background/68 sm:bg-background/62 sm:dark:bg-background/56"
        />

        <div className="relative z-10 mx-auto w-full max-w-[1480px]">
          <Reveal className="max-w-3xl">
            <p className="docwise-eyebrow">Research without tab-switching</p>
            <h1 className="mt-5 font-heading text-5xl leading-none sm:text-6xl lg:text-8xl">
              DocWise
            </h1>
            <p className="mt-6 max-w-2xl font-heading text-2xl leading-tight text-foreground sm:text-3xl lg:text-4xl">
              Your source stays beside the answer.
            </p>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Open a PDF, lecture, or recording. Ask a question, inspect the
              supporting passage, and keep the conversation attached to the
              material.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="xl"
                onClick={handleGetStarted}
                className="w-full sm:w-auto"
              >
                {user ? "Open your library" : "Start with a document"}
                <ArrowRight />
              </Button>
              <Button
                variant="outline"
                size="xl"
                onClick={() => scrollToId("workspace")}
                className="w-full bg-background/70 sm:w-auto"
              >
                See the workspace
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/80 pt-5">
              {SOURCE_LABELS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground"
                >
                  <Icon className="size-3.5" />
                  {label}
                </span>
              ))}
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                One workspace
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      <section
        id="workspace"
        className="scroll-mt-14 border-b border-border px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
      >
        <div className="mx-auto max-w-[1480px]">
          <Reveal className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(380px,0.55fr)] lg:items-end lg:justify-between">
            <div>
              <p className="docwise-eyebrow">The workspace</p>
              <h2 className="mt-4 max-w-3xl font-heading text-3xl leading-tight sm:text-4xl lg:text-5xl">
                Read it. Ask it. Verify it.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              DocWise keeps the original material, the conversation, and the
              supporting location in one view. Answers stay useful because the
              source never disappears behind them.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <WorkspacePreview />
          </Reveal>
        </div>
      </section>

      <section
        id="sources"
        className="scroll-mt-14 border-b border-border px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
      >
        <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[minmax(260px,0.55fr)_minmax(0,1.25fr)] lg:gap-20">
          <Reveal>
            <p className="docwise-eyebrow">Your material</p>
            <h2 className="mt-4 max-w-md font-heading text-3xl leading-tight sm:text-4xl">
              One workspace. Three kinds of source.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              The interface changes with the material, while the habit stays
              the same: ask, inspect, and return to the original.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <SourceFormats />
          </Reveal>
        </div>
      </section>

      <section className="border-b border-border px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[minmax(300px,0.7fr)_minmax(460px,1fr)] lg:items-center lg:gap-20">
          <Reveal>
            <p className="docwise-eyebrow">Follow-up questions</p>
            <h2 className="mt-4 max-w-xl font-heading text-3xl leading-tight sm:text-4xl lg:text-5xl">
              The second question should not start over.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Keep a thread for the work you are doing. Follow-ups stay tied to
              the current conversation and the document you chose, so you can
              refine an answer instead of rebuilding the prompt.
            </p>
            <div className="mt-7 space-y-3 text-sm text-muted-foreground">
              <p className="flex items-center gap-3">
                <Check className="size-4 text-foreground" />
                Resume the same line of inquiry later.
              </p>
              <p className="flex items-center gap-3">
                <Check className="size-4 text-foreground" />
                Keep each project in a separate thread.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <ConversationPreview />
          </Reveal>
        </div>
      </section>

      <section
        id="context"
        className="scroll-mt-14 border-b border-border px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
      >
        <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[minmax(340px,0.85fr)_minmax(420px,1fr)] lg:items-center lg:gap-24">
          <Reveal>
            <p className="docwise-eyebrow">Context control</p>
            <h2 className="mt-4 max-w-xl font-heading text-3xl leading-tight sm:text-4xl lg:text-5xl">
              Your library is not the default prompt.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Use General mode for an ordinary conversation. Switch to
              Documents when you want an answer grounded in a selected file.
              Uploaded material stays out until you choose it.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <ContextChoice />
          </Reveal>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <Reveal className="mx-auto max-w-[1200px] border-y border-border py-14 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="docwise-eyebrow">Open the first source</p>
              <h2 className="mt-4 max-w-3xl font-heading text-3xl leading-tight sm:text-4xl lg:text-5xl">
                Start with the file already on your desk.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Bring one document. Ask the question that made you open it.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="xl" onClick={handleGetStarted}>
                {user ? "Go to your library" : "Create your workspace"}
                <ArrowRight />
              </Button>
              {!user ? (
                <Button
                  size="xl"
                  variant="outline"
                  onClick={() => router.push("/login")}
                >
                  Log in
                </Button>
              ) : null}
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border px-4 py-7 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark href="/" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <a href="#workspace" className="transition-colors hover:text-foreground">
              Workspace
            </a>
            <a href="#sources" className="transition-colors hover:text-foreground">
              Sources
            </a>
            <a href="#context" className="transition-colors hover:text-foreground">
              Context
            </a>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            <MessageSquareText className="size-3.5" />
            Read · Ask · Verify
          </span>
        </div>
      </footer>
    </main>
  );
}
