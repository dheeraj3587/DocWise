import { ImageResponse } from "next/og";

/**
 * Generated at build/request time so the social card always exists. The
 * metadata used to point at `/home-page.png`, which was never in `public/`.
 * Next wires this file into both `openGraph` and `twitter` automatically.
 *
 * Colours are the .dark palette's literal values (--background, --foreground,
 * --muted-foreground, --primary). `ImageResponse` cannot resolve CSS custom
 * properties, so they have to be hardcoded — keep them in step with
 * app/globals.css.
 */
export const alt = "DocWise — read, question, and verify your documents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c0d0d",
          color: "#f3f4f6",
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#9ca3af",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              background: "#00e599",
              borderRadius: 4,
            }}
          />
          DocWise
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.1, letterSpacing: -2 }}>
            Read, question, and verify
          </div>
          <div style={{ fontSize: 40, lineHeight: 1.3, color: "#9ca3af" }}>
            PDFs, audio, and video in one focused workspace.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#9ca3af" }}>
          Grounded answers with citations you can open.
        </div>
      </div>
    ),
    size,
  );
}
