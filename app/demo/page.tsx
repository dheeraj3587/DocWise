"use client";

import { BrandMark } from "@/components/docwise/brand-mark";
import { ParticleFieldLazy } from "@/components/particle-field-lazy";

export default function DemoPage() {
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div className="absolute left-5 top-5 z-10">
        <BrandMark href="/" />
      </div>
      <ParticleFieldLazy
        src="/logo.png"
        sampleStep={3}
        threshold={38}
        dotSize={1}
        mouseForce={90}
        mouseRadius={120}
        denseParticles
      />
    </main>
  );
}
