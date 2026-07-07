"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  History,
  LucideIcon,
  Scissors,
  Search,
  Sparkles,
  UploadCloud,
  Workflow,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useUserSync } from "@/lib/use-user-sync";

type PipelineStep = {
  n: string;
  key: string;
  title: string;
  desc: string;
  Icon: LucideIcon;
};

type SystemCard = {
  Icon: LucideIcon;
  title: string;
  desc: string;
  stats?: Array<{
    label: string;
    value: string;
  }>;
};

const PIPELINE_STEPS: PipelineStep[] = [
  {
    n: "01",
    key: "ingest",
    title: "Ingest",
    desc: "Documents are parsed and normalized on upload.",
    Icon: UploadCloud,
  },
  {
    n: "02",
    key: "chunk",
    title: "Chunk",
    desc: "Text is split into overlapping, context-aware segments.",
    Icon: Scissors,
  },
  {
    n: "03",
    key: "embed",
    title: "Embed",
    desc: "Each chunk is encoded into a shared vector space.",
    Icon: Boxes,
  },
  {
    n: "04",
    key: "index",
    title: "Index",
    desc: "Vectors are stored in FAISS for fast semantic search.",
    Icon: Database,
  },
  {
    n: "05",
    key: "retrieve",
    title: "Retrieve",
    desc: "The most relevant chunks are pulled for the query.",
    Icon: Search,
  },
  {
    n: "06",
    key: "generate",
    title: "Generate",
    desc: "The model answers using only retrieved context.",
    Icon: Sparkles,
  },
];

const SYSTEMS: SystemCard[] = [
  {
    Icon: Workflow,
    title: "Agent reasoning",
    desc: "Before retrieving anything, the agent decides whether the query needs it. Small talk gets a direct reply, knowledge questions trigger retrieval, and thin context produces a clear answer instead of a guess.",
  },
  {
    Icon: History,
    title: "Conversational memory",
    desc: "Session state persists across turns and visits, so follow-up questions inherit context instead of starting from zero.",
  },
  {
    Icon: Activity,
    title: "Observability",
    desc: "Every request is logged for latency, retrieval quality, and possible hallucination, so regressions surface before users report them.",
    stats: [
      { label: "Avg. latency", value: "340ms" },
      { label: "Retrieval precision", value: "0.93" },
      { label: "Reviewed responses", value: "100%" },
    ],
  },
];

const STACK = [
  "FastAPI",
  "FAISS",
  "Vector search",
  "Internal REST API",
  "Session memory",
  "Confidence scoring",
];

const TRACE_QUERY = "What's our refund policy for enterprise contracts?";
const TRACE_LINES = [
  "Analyzing query - retrieval required",
  "Searching vector index / FAISS / top-k = 6",
  "Confidence 0.94 / 3 sources retrieved",
];
const CITATIONS = ["MSA section 4.2", "Refund Policy v3", "Support Handbook"];
const HERO_DOCUMENTS = ["MSA.pdf", "Refund.md", "Support.txt"];

const LANDING_BLACK_THEME = {
  "--background": "#050505",
  "--foreground": "#ededed",
  "--muted-foreground": "#9b9ba3",
  "--border": "rgba(255,255,255,0.105)",
  "--input": "rgba(255,255,255,0.12)",
  "--primary": "#ededed",
  "--primary-foreground": "#050505",
  "--secondary": "rgba(255,255,255,0.075)",
  "--secondary-foreground": "#ededed",
  "--accent": "rgba(255,255,255,0.085)",
  "--accent-foreground": "#ededed",
  "--glass-bg": "rgba(10,10,10,0.82)",
  "--glass-border": "rgba(255,255,255,0.13)",
  "--glass-shadow": "0 24px 80px rgba(0,0,0,0.52)",
  "--surface-1": "rgba(255,255,255,0.035)",
  "--surface-2": "rgba(255,255,255,0.06)",
  "--surface-3": "rgba(255,255,255,0.09)",
} as CSSProperties;

const revealUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

const softPop = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export default function HomeClient() {
  const { user } = useUser();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [activePipelineStep, setActivePipelineStep] = useState(0);
  const reduceMotion = prefersReducedMotion ?? false;
  const visibleStage = reduceMotion ? TRACE_LINES.length + 1 : stage;
  const displayedPipelineStep = reduceMotion
    ? PIPELINE_STEPS.length - 1
    : activePipelineStep;
  const pipelineProgress =
    (displayedPipelineStep / (PIPELINE_STEPS.length - 1)) * 100;
  const activeStep = PIPELINE_STEPS[displayedPipelineStep];
  useUserSync();

  useEffect(() => {
    if (reduceMotion) return;

    const interval = window.setInterval(() => {
      setActivePipelineStep((current) => (current + 1) % PIPELINE_STEPS.length);
    }, 1150);

    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;

    const timeout = window.setTimeout(
      () =>
        setStage((current) =>
          current >= TRACE_LINES.length + 1 ? 0 : current + 1,
        ),
      stage >= TRACE_LINES.length + 1 ? 2200 : stage === 0 ? 650 : 620,
    );

    return () => window.clearTimeout(timeout);
  }, [stage, reduceMotion]);

  const handleGetStarted = useCallback(() => {
    router.push(user ? "/dashboard" : "/signup");
  }, [router, user]);

  const scrollToId = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    },
    [reduceMotion],
  );

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-[#050505] text-foreground"
      style={LANDING_BLACK_THEME}
    >
      <style>{`
        .landing-pulse { animation: landing-pulse 1.7s ease-in-out infinite; }
        .landing-doc-flow { animation: landing-doc-flow 4.8s cubic-bezier(.45,0,.2,1) infinite; }
        .landing-stack-drift { animation: landing-stack-drift 7.2s ease-in-out infinite; }
        .landing-flow-card { transition: border-color .35s ease, background-color .35s ease, box-shadow .35s ease, color .35s ease; }
        .pipeline-pop {
          --pipeline-accent: #ededed;
          --pipeline-ink: #080808;
        }

        @keyframes landing-pulse {
          0%, 100% { opacity: .45; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.6); }
        }
        @keyframes landing-doc-flow {
          0% { transform: translate3d(-34px, 16px, 0) scale(.92); opacity: 0; }
          18% { opacity: .56; }
          72% { opacity: .48; }
          100% { transform: translate3d(182px, -10px, 0) scale(.78); opacity: 0; }
        }
        @keyframes landing-stack-drift {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-pulse,
          .landing-doc-flow,
          .landing-stack-drift {
            animation: none !important;
          }
        }
      `}</style>

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/75 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-left"
            aria-label="Go to DocWise home"
          >
            <span className="grid size-8 place-items-center overflow-hidden rounded-lg border border-border/70 bg-background/70">
              <Image
                src="/docwise-logo-bw.png"
                alt=""
                width={22}
                height={22}
                className="size-5 object-contain dark:invert"
                priority
              />
            </span>
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em]">
              DocWise
            </span>
          </button>

          <div className="hidden items-center gap-1 md:flex">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={() => scrollToId("pipeline")}
            >
              How it works
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={() => scrollToId("architecture")}
            >
              Architecture
            </button>
          </div>

          <div className="flex items-center gap-2">
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
                <Button
                  size="sm"
                  onClick={() => router.push("/signup")}
                >
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

      <section className="relative overflow-hidden border-b border-border/70 px-4 py-16 sm:px-6 sm:py-24">
        <div className="relative mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[1.06fr_0.94fr] lg:gap-14">
          <motion.div
            className="pt-4"
            variants={revealUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Agentic RAG / Enterprise knowledge
            </div>
            <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
              Every answer, grounded in your own documents.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              DocWise retrieves the exact passages behind each response, reasons
              over them, and says so plainly when it is not confident enough to
              answer.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="xl"
                onClick={handleGetStarted}
                className="w-full sm:w-auto"
              >
                {user ? "Open dashboard" : "Get started free"}
                <ArrowRight />
              </Button>
              <Button
                variant="outline"
                size="xl"
                onClick={() => scrollToId("pipeline")}
                className="w-full bg-background/55 sm:w-auto"
              >
                See how it works
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Private document workspace / Every answer cites its sources
            </p>
          </motion.div>

          <motion.div
            className="relative"
            variants={softPop}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, delay: 0.12, ease: "easeOut" }}
          >
            <div className="pointer-events-none absolute -left-10 top-32 z-0 hidden h-28 w-72 lg:block">
              {HERO_DOCUMENTS.map((doc, index) => (
                <span
                  className="landing-doc-flow absolute rounded-md border border-border/80 bg-background/75 px-3 py-1.5 font-mono text-[10px] text-muted-foreground shadow-sm backdrop-blur"
                  key={doc}
                  style={{
                    top: `${index * 30}px`,
                    animationDelay: `${index * 0.75}s`,
                  }}
                >
                  {doc}
                </span>
              ))}
            </div>

            <div className="glass-strong relative z-10 overflow-hidden rounded-lg p-4 shadow-2xl shadow-black/5">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Live query trace
                </span>
                <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span className="landing-pulse size-1.5 rounded-full bg-foreground" />
                  Example
                </span>
              </div>

              <div className="flex min-h-[240px] flex-col gap-3">
                <div className="ml-auto max-w-[88%] rounded-lg border border-border/70 bg-surface-2 px-4 py-3 text-sm leading-6">
                  {TRACE_QUERY}
                </div>

                <div className="flex flex-col gap-2 px-1">
                  {TRACE_LINES.map((line, i) =>
                    visibleStage > i ? (
                      <motion.div
                        className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
                        key={line}
                        initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                        animate={
                          reduceMotion ? undefined : { opacity: 1, x: 0 }
                        }
                        transition={{ duration: 0.25 }}
                      >
                        <CheckCircle2 className="size-3.5 shrink-0 text-foreground" />
                        <span>{line}</span>
                      </motion.div>
                    ) : null,
                  )}
                </div>

                {visibleStage > TRACE_LINES.length ? (
                  <motion.div
                    className="mr-auto max-w-[92%] rounded-lg border border-border/70 bg-background/55 px-4 py-3 text-sm leading-6"
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <p>
                      Enterprise contracts include a 30-day refund window from
                      the invoice date, prorated after the first billing cycle.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CITATIONS.map((citation) => (
                        <span
                          className="rounded-md border border-border/70 bg-surface-3 px-2 py-1 font-mono text-[11px] text-muted-foreground"
                          key={citation}
                        >
                          {citation}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <motion.section
        className="pipeline-pop border-t border-border/70 px-4 py-16 sm:px-6 sm:py-24"
        id="pipeline"
        variants={revealUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.5 }}
      >
        <SectionHead
          eyebrow="Pipeline"
          title="How a query becomes an answer"
          description="Six deterministic stages turn a raw document into a grounded response."
        />

        <div className="relative mx-auto mt-12 max-w-6xl">
          <div className="absolute left-[8.333%] right-[8.333%] top-[27px] hidden h-[2px] md:block">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
            <motion.div
              aria-hidden
              className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
              style={{
                background: "var(--pipeline-accent)",
                boxShadow:
                  "0 0 22px color-mix(in srgb, var(--pipeline-accent) 34%, transparent)",
              }}
              animate={{ width: `${pipelineProgress}%` }}
              transition={{
                duration: reduceMotion ? 0 : 0.55,
                ease: "easeOut",
              }}
            />
            <motion.div
              aria-hidden
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
              style={{
                background: "var(--pipeline-accent)",
                boxShadow:
                  "0 0 0 8px color-mix(in srgb, var(--pipeline-accent) 12%, transparent), 0 0 30px color-mix(in srgb, var(--pipeline-accent) 58%, transparent)",
              }}
              animate={{ left: `${pipelineProgress}%` }}
              transition={{
                duration: reduceMotion ? 0 : 0.55,
                ease: "easeOut",
              }}
            />
          </div>
          <div className="relative grid gap-6 md:grid-cols-6 md:gap-4">
            {PIPELINE_STEPS.map((step, index) => {
              const isActive = index === displayedPipelineStep;
              const isDone = reduceMotion || index < displayedPipelineStep;

              return (
                <motion.div
                  className="flex gap-4 text-left md:flex-col md:items-center md:gap-0 md:text-center"
                  key={step.key}
                  variants={softPop}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-80px" }}
                  animate={reduceMotion ? undefined : { y: isActive ? -5 : 0 }}
                  transition={{ duration: 0.4, delay: index * 0.06 }}
                >
                  <div className="relative shrink-0">
                    {isActive && !reduceMotion ? (
                      <motion.span
                        aria-hidden
                        className="absolute inset-[-8px] rounded-full border"
                        style={{
                          borderColor:
                            "color-mix(in srgb, var(--pipeline-accent) 70%, transparent)",
                          boxShadow:
                            "0 0 26px color-mix(in srgb, var(--pipeline-accent) 22%, transparent)",
                        }}
                        initial={{ opacity: 0, scale: 0.82 }}
                        animate={{
                          opacity: [0.2, 0.85, 0.2],
                          scale: [0.88, 1.16, 0.88],
                        }}
                        transition={{
                          duration: 1.15,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: "easeInOut",
                        }}
                      />
                    ) : null}
                    <div
                      className="landing-flow-card grid size-14 place-items-center rounded-full border bg-background shadow-sm"
                      style={{
                        borderColor:
                          isActive || isDone
                            ? isActive
                              ? "var(--pipeline-accent)"
                              : "color-mix(in srgb, var(--pipeline-accent) 52%, var(--border))"
                            : "var(--border)",
                        background: isActive
                          ? "color-mix(in srgb, var(--pipeline-ink) 90%, var(--pipeline-accent))"
                          : undefined,
                        color:
                          isActive || isDone
                            ? "var(--foreground)"
                            : "var(--muted-foreground)",
                        boxShadow: isActive
                          ? "0 0 0 6px color-mix(in srgb, var(--pipeline-accent) 10%, transparent), 0 0 28px color-mix(in srgb, var(--pipeline-accent) 24%, transparent), 0 18px 36px rgba(0,0,0,.18)"
                          : undefined,
                      }}
                    >
                      <step.Icon size={20} strokeWidth={1.7} />
                    </div>
                  </div>
                  <div className="md:mt-4">
                    <div className="mb-2 flex items-baseline gap-2 md:justify-center">
                      <span
                        className="font-mono text-[11px]"
                        style={{
                          color: isActive
                            ? "var(--pipeline-accent)"
                            : "var(--muted-foreground)",
                        }}
                      >
                        {step.n}
                      </span>
                      <h3 className="text-sm font-semibold">{step.title}</h3>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground md:text-xs md:leading-5">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <motion.div
            className="mx-auto mt-10 grid max-w-4xl gap-4 rounded-lg border p-4 shadow-sm md:grid-cols-[0.74fr_1.26fr] md:items-center"
            style={{
              borderColor:
                "color-mix(in srgb, var(--pipeline-accent) 24%, var(--border))",
              background:
                "color-mix(in srgb, var(--surface-1) 86%, var(--pipeline-accent))",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,.04), 0 18px 50px rgba(0,0,0,.16)",
            }}
            animate={
              reduceMotion ? undefined : { y: activePipelineStep % 2 ? -2 : 0 }
            }
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Active stage
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className="grid size-9 place-items-center rounded-full border bg-background font-mono text-[11px] text-foreground"
                  style={{
                    borderColor: "var(--pipeline-accent)",
                    boxShadow:
                      "0 0 20px color-mix(in srgb, var(--pipeline-accent) 20%, transparent)",
                  }}
                >
                  {activeStep.n}
                </span>
                <span className="font-heading text-xl font-semibold">
                  {activeStep.title}
                </span>
              </div>
            </div>
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: "var(--pipeline-accent)",
                    boxShadow:
                      "0 0 16px color-mix(in srgb, var(--pipeline-accent) 28%, transparent)",
                  }}
                  initial={false}
                  animate={{ width: `${pipelineProgress}%` }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.55,
                    ease: "easeOut",
                  }}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {activeStep.desc}
              </p>
            </div>
          </motion.div>
        </div>
      </motion.section>

      <motion.section
        className="border-t border-border/70 px-4 py-16 sm:px-6 sm:py-24"
        id="architecture"
        variants={revealUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.5 }}
      >
        <SectionHead
          eyebrow="Architecture"
          title="Three systems run underneath"
          description="Alongside retrieval, these keep answers safe and useful over time."
        />

        <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-3">
          {SYSTEMS.map((system, index) => (
            <motion.article
              className="glass rounded-lg p-6 transition hover:-translate-y-1 hover:border-border"
              key={system.title}
              variants={softPop}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.42, delay: index * 0.08 }}
            >
              <div className="mb-5 grid size-10 place-items-center rounded-lg border border-border/80 bg-background/60 text-foreground">
                <system.Icon size={18} strokeWidth={1.7} />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {system.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {system.desc}
              </p>
              {system.stats ? (
                <div className="mt-6 flex flex-wrap gap-5 border-t border-border/70 pt-5">
                  {system.stats.map((stat) => (
                    <div className="flex flex-col gap-1" key={stat.label}>
                      <span className="font-mono text-base font-semibold">
                        {stat.value}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {stat.label}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </motion.article>
          ))}
        </div>
      </motion.section>

      <section className="border-t border-border/70 px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Built with
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {STACK.map((item) => (
              <span
                className="rounded-full border border-border/80 bg-background/55 px-4 py-2 font-mono text-xs text-muted-foreground"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 px-4 py-16 text-center sm:px-6 sm:py-24">
        <h2 className="mx-auto max-w-2xl font-heading text-3xl font-semibold leading-tight sm:text-4xl">
          Bring DocWise to your knowledge base.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
          Point it at your documents, ask questions, and keep every answer tied
          to the source material.
        </p>
        <div className="mt-8 flex justify-center">
          <Button size="xl" onClick={handleGetStarted}>
            {user ? "Open dashboard" : "Get started free"}
            <ArrowRight />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/70 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.2em]">
            <span className="inline-block size-2 rounded-full bg-foreground" />
            DocWise
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={() => scrollToId("pipeline")}
            >
              How it works
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={() => scrollToId("architecture")}
            >
              Architecture
            </button>
            {!user ? (
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={() => router.push("/login")}
              >
                Log in
              </button>
            ) : null}
          </div>
        </div>
      </footer>
    </main>
  );
}

function SectionHead({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
        {eyebrow}
      </div>
      <h2 className="mt-3 font-heading text-3xl font-semibold leading-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
        {description}
      </p>
    </div>
  );
}
