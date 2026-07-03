"use client";

import dynamic from "next/dynamic";

export const ParticleFieldLazy = dynamic(
  () => import("@/components/particle-field").then((mod) => mod.ParticleField),
  { ssr: false, loading: () => <div className="size-full" /> },
);

export { bumpParticleTypingImpulse, pulseParticleSubmitImpulse } from "@/components/particle-field";
