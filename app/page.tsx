export const dynamic = "force-dynamic";

import type { Metadata } from "next";

import HomeClient from "./_home-client";

export const metadata: Metadata = {
  title: "DocWise | Read, ask, and verify your documents",
  description:
    "Open a PDF, lecture, or recording. Ask questions, inspect the supporting passage, and keep the conversation beside the source.",
  openGraph: {
    title: "DocWise | Your source stays beside the answer",
    description:
      "Read, question, and verify PDFs, audio, and video in one focused workspace.",
    images: ["/home-page.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "DocWise | Your source stays beside the answer",
    description:
      "Read, question, and verify PDFs, audio, and video in one focused workspace.",
    images: ["/home-page.png"],
  },
};

export default function Home() {
  return <HomeClient />;
}
