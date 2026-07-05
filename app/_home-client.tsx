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
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useUserSync } from "@/lib/use-user-sync";

type SpherePoint = {
  x: number;
  y: number;
  z: number;
};

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

function fibonacciSpherePoints(count: number): SpherePoint[] {
  const points: SpherePoint[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    points.push({ x, y, z });
  }

  return points;
}

function DotSphere({
  size = 64,
  dots = 240,
  color = "currentColor",
}: {
  size?: number;
  dots?: number;
  color?: string;
}) {
  const points = useMemo(() => fibonacciSpherePoints(dots), [dots]);
  const r = size / 2;

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block overflow-visible"
    >
      {points.map((p, i) => {
        const cx = r + p.x * r * 0.96;
        const cy = r + p.y * r * 0.96;
        const light = (p.z + 1) / 2;
        const dotR = 0.35 + light * (size / 70);
        const opacity = 0.1 + light * 0.7;

        return (
          <circle
            key={`${i}-${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={dotR}
            fill={color}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function TracedLogoBackdrop({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="520 230 520 520"
      className="h-full w-full overflow-visible"
      fill="none"
    >
      <defs>
        <radialGradient
          id="landingLogoTraceGradient"
          cx="760"
          cy="488"
          r="310"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--premium-teal)" stopOpacity="0.78" />
          <stop
            offset="0.56"
            stopColor="var(--premium-amber)"
            stopOpacity="0.36"
          />
          <stop offset="1" stopColor="var(--foreground)" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <path
        d={DOCWISE_LOGO_PATH}
        stroke="var(--foreground)"
        strokeOpacity="0.08"
        strokeLinejoin="round"
        strokeWidth="18"
      />
      <motion.path
        d={DOCWISE_LOGO_PATH}
        className={reduceMotion ? undefined : "landing-trace-draw"}
        stroke="url(#landingLogoTraceGradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </svg>
  );
}

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
const DOCWISE_LOGO_PATH =
  "M 624 256.980 C 573.695 257.814, 571.702 258.213, 563.736 269.045 C 556.420 278.993, 559.566 291.334, 583.729 347.460 C 600.533 386.492, 602.961 389.586, 621.952 396.170 C 630.771 399.228, 651.763 399.935, 734.750 399.969 L 811 400 811 407.818 C 811 424.400, 802.562 440.823, 787.076 454.382 C 774.997 464.958, 779.412 464.378, 705 465.159 C 630.097 465.944, 627.534 466.059, 619.753 468.982 C 606.040 474.134, 596.693 488.516, 560.726 559.805 C 547.375 586.268, 547.754 588.946, 572.603 643.726 C 596.074 695.466, 598.874 699.035, 615.946 698.978 C 631.121 698.927, 638.449 691.883, 655.974 660.500 C 667.185 640.425, 672.413 635.011, 680.593 635.004 C 693.035 634.992, 701.353 646.042, 713.712 679 C 721.631 700.114, 726.473 706.590, 738.533 712.192 C 744.550 714.988, 805.709 715.729, 899 714.137 C 955.185 713.178, 955.594 713.137, 963.651 707.723 C 977.716 698.271, 977.693 693.886, 963.370 654.132 C 940.505 590.666, 941.160 592.223, 934.246 584.832 C 923.035 572.846, 920.311 572.438, 839 570.572 C 725.144 567.957, 735.150 568.963, 732.979 559.914 C 729.158 543.984, 734.954 526.790, 748.693 513.298 C 756.374 505.756, 753.656 506.015, 825.500 505.980 C 929.609 505.929, 920.932 509.732, 952.090 450.500 C 987.700 382.804, 987.352 390.586, 958.344 310.652 C 943.685 270.257, 941.110 265.754, 929.602 260.395 C 913.751 253.014, 903.638 259.323, 885.296 288.036 C 854.924 335.581, 851.247 335.906, 829 293 C 809.407 255.214, 814.356 256.980, 727 256.589 C 692.625 256.435, 646.275 256.611, 624 256.980";

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
    <main className="min-h-screen overflow-x-hidden bg-mesh text-foreground">
      <style>{`
        .landing-float-slow { animation: landing-float 7s ease-in-out infinite; }
        .landing-spin-soft { animation: landing-spin 26s linear infinite; transform-origin: center; }
        .landing-scan { animation: landing-scan 2.8s ease-in-out infinite; }
        .landing-pulse { animation: landing-pulse 1.7s ease-in-out infinite; }
        .landing-doc-flow { animation: landing-doc-flow 4.8s cubic-bezier(.45,0,.2,1) infinite; }
        .landing-shimmer-line { animation: landing-shimmer-line 2.6s ease-in-out infinite; }
        .landing-stack-drift { animation: landing-stack-drift 7.2s ease-in-out infinite; }
        .landing-trace-draw { stroke-dasharray: 1320; stroke-dashoffset: 1320; animation: landing-trace-draw 2.6s cubic-bezier(.2,.75,.12,1) forwards, landing-trace-breathe 5.8s ease-in-out 2.6s infinite; }
        .landing-flow-packet { filter: drop-shadow(0 0 16px color-mix(in srgb, var(--premium-teal) 68%, transparent)); }
        .landing-flow-card { transition: border-color .35s ease, background-color .35s ease, box-shadow .35s ease, color .35s ease; }

        @keyframes landing-float {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50% { transform: translate3d(0, -10px, 0) rotate(1.5deg); }
        }
        @keyframes landing-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes landing-scan {
          0% { transform: translateY(-120%); opacity: 0; }
          18%, 72% { opacity: .75; }
          100% { transform: translateY(360%); opacity: 0; }
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
        @keyframes landing-shimmer-line {
          0%, 100% { background-position: 0% 50%; opacity: .55; }
          50% { background-position: 100% 50%; opacity: 1; }
        }
        @keyframes landing-stack-drift {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes landing-trace-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes landing-trace-breathe {
          0%, 100% { opacity: .28; }
          50% { opacity: .58; }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-float-slow,
          .landing-spin-soft,
          .landing-scan,
          .landing-pulse,
          .landing-doc-flow,
          .landing-shimmer-line,
          .landing-stack-drift,
          .landing-trace-draw {
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
                  className="glow-gold-subtle"
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

      <section className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24">
        <div className="pointer-events-none absolute -left-28 -top-24 hidden text-gold/35 dark:text-gold/25 lg:block landing-spin-soft">
          <DotSphere size={330} dots={420} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_560px_at_82%_12%,rgba(196,154,58,0.14),transparent_60%)] dark:bg-[radial-gradient(900px_560px_at_82%_12%,rgba(241,206,115,0.09),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--premium-amber),var(--premium-teal),transparent)] bg-[length:220%_100%] landing-shimmer-line"
        />

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
                className="glow-gold-subtle w-full sm:w-auto"
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
            <div className="pointer-events-none absolute -right-16 -top-20 z-0 hidden h-60 w-60 lg:block">
              <TracedLogoBackdrop reduceMotion={reduceMotion} />
            </div>

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
              <div
                aria-hidden
                className="landing-scan pointer-events-none absolute left-0 right-0 top-1/3 h-12 bg-gradient-to-b from-transparent via-gold/5 to-transparent"
              />
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Live query trace
                </span>
                <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span className="landing-pulse size-1.5 rounded-full bg-premium-teal" />
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
                        <CheckCircle2 className="size-3.5 shrink-0 text-premium-teal" />
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
        className="border-t border-border/70 px-4 py-16 sm:px-6 sm:py-24"
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
          <div className="absolute left-[8.333%] right-[8.333%] top-[27px] hidden h-px md:block">
            <div className="absolute inset-0 border-t border-dotted border-border" />
            <motion.div
              aria-hidden
              className="absolute left-0 top-0 h-px bg-[linear-gradient(90deg,var(--premium-teal),var(--premium-amber))]"
              animate={{ width: `${pipelineProgress}%` }}
              transition={{
                duration: reduceMotion ? 0 : 0.55,
                ease: "easeOut",
              }}
            />
            <motion.div
              aria-hidden
              className="landing-flow-packet absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-[var(--premium-teal)]"
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
                        className="absolute inset-[-7px] rounded-full border border-[color:var(--premium-teal)]"
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
                            ? "color-mix(in srgb, var(--premium-teal) 64%, var(--border))"
                            : "var(--border)",
                        background: isActive
                          ? "color-mix(in srgb, var(--premium-teal) 14%, var(--background))"
                          : undefined,
                        color:
                          isActive || isDone
                            ? "var(--foreground)"
                            : "var(--muted-foreground)",
                        boxShadow: isActive
                          ? "0 0 0 6px color-mix(in srgb, var(--premium-teal) 10%, transparent), 0 18px 36px rgba(0,0,0,.12)"
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
                            ? "var(--premium-teal)"
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
            className="mx-auto mt-10 grid max-w-4xl gap-4 rounded-lg border border-border/80 bg-surface-1 p-4 shadow-sm md:grid-cols-[0.74fr_1.26fr] md:items-center"
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
                <span className="grid size-9 place-items-center rounded-full border border-[color:var(--premium-teal)] bg-background font-mono text-[11px] text-foreground">
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
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--premium-teal),var(--premium-amber))]"
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
          <Button
            size="xl"
            onClick={handleGetStarted}
            className="glow-gold-subtle"
          >
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
