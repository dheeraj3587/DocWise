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
  title: "DocWise",
  description: "Smart note-taking editor",

  openGraph: {
    title: "DocWise",
    description: "Smart note-taking editor",
    url: "https://docwise.vercel.app",
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
