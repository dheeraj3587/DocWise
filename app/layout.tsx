import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_API_URL || "https://dheerajjoshi.me"),
  title: "DocWise",
  description: "Smart note-taking editor",

  openGraph: {
    title: "DocWise",
    description: "Smart note-taking editor",
    url: "https://dheerajjoshi.me",
    siteName: "DocWise",
    images: [
      {
        url: "/home-page.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "DocWise",
    description: "Smart note-taking editor",
    images: ["/home-page.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Polyfill crypto.randomUUID for non-secure (HTTP) contexts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
                crypto.randomUUID = function() {
                  var bytes = new Uint8Array(16);
                  crypto.getRandomValues(bytes);
                  bytes[6] = (bytes[6] & 0x0f) | 0x40;
                  bytes[8] = (bytes[8] & 0x3f) | 0x80;
                  var hex = Array.from(bytes, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
                  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
                };
              }
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${outfit.variable} antialiased font-sans`}
        style={{ fontFamily: "var(--font-inter)" }}
      >
        <ClerkProvider dynamic>
          {children}
        </ClerkProvider>
        <Toaster />
      </body>
    </html>
  );
}
