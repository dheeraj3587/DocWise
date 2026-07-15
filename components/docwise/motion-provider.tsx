"use client";

import { MotionConfig } from "motion/react";

export function DocWiseMotionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionConfig>
  );
}
