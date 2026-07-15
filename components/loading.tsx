"use client";

import { motion } from "motion/react";
import { BrandMark } from "@/components/docwise/brand-mark";

export default function LoadingPage() {
  return (
    <div className="grid h-[100dvh] w-full place-items-center bg-background">
      <div className="flex w-44 flex-col items-center gap-5">
        <BrandMark />
        <div className="h-px w-full overflow-hidden bg-border">
          <motion.div
            className="h-full w-1/3 origin-left bg-foreground"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
          />
        </div>
        <p className="mono-label">Preparing workspace</p>
      </div>
    </div>
  );
}
