"use client";
import { Heart, StarIcon } from "lucide-react";
import { GithubIcon } from "lucide-react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";
import { createUser } from "@/lib/api-client";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect } from "react";
import { Playfair_Display } from "next/font/google";
import Footer from "@/components/footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const elegantFont = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export default function Home() {
  const { user } = useUser();
  const router = useRouter();
  const { getToken } = useAuth();

  const checkUser = useCallback(async () => {
    try {
      const token = await getToken();
      await createUser(
        {
          email: user?.primaryEmailAddress?.emailAddress as string,
          name: user?.firstName as string,
          image_url: user?.imageUrl as string,
        },
        token,
      );
    } catch (error) {
      console.error("Error creating user:", error);
    }
  }, [getToken, user]);

  useEffect(() => {
    if (user) {
      checkUser();
    }
  }, [user, checkUser]);

  const handleGetStarted = async () => {
    if (user) {
      router.push("/dashboard");
    } else {
      router.push("/sign-in");
    }
  };

  return (
    <div className="min-h-screen bg-mesh text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-subtle">
        <nav className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center max-w-6xl">
          <div
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-xl sm:text-2xl font-semibold text-foreground cursor-pointer"
          >
            <img src="/logo.png" alt="DocWise Logo" className="h-8 w-auto object-contain" />
            DocWise
          </div>
          <div className="flex gap-2 sm:gap-3 items-center">
            <ThemeToggle />
            {!user ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => router.push("/sign-in")}
                  className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm"
                >
                  Log in
                </Button>
                <Button
                  onClick={() => router.push("/sign-up")}
                  className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm"
                >
                  Get started
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => router.push("/dashboard")}
                  className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm"
                >
                  Dashboard
                </Button>
                <UserButton />
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center max-w-4xl">
        <Link
          href="https://github.com/dheeraj3587/rag-document-chat"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 px-3 py-1.5 mb-6 sm:mb-8 glass rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
        >
          <GithubIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Star on GitHub</span>
          <span className="sm:hidden">Star us</span>
          <div className="w-px h-4 bg-border"></div>
          <StarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors text-gold group-hover:fill-gold" />
        </Link>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4 sm:mb-6 text-foreground tracking-tight leading-tight px-2 font-(family-name:var(--font-outfit))">
          Your{" "}
          <span
            className={`text-gold italic text-[1.08em] ${elegantFont.className}`}
          >
            intelligent
          </span>{" "}
          notebook <br className="hidden sm:block" />
          <span className="sm:hidden">for </span>
          <span className="hidden sm:inline">for any </span>document.
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed px-4">
          Write, organize, and ask questions. DocWise turns your notes into
          answers.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center px-4">
          <Button
            onClick={handleGetStarted}
            className="px-6 py-3 font-medium text-sm w-full sm:w-auto glow-gold-subtle"
          >
            Get started free →
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/video")}
            className="px-6 py-3 font-medium text-sm w-full sm:w-auto"
          >
            See how it works
          </Button>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap gap-2 sm:gap-3 justify-center mt-8 sm:mt-12 px-4">
          {["Lightning fast", "Secure & private", "AI-powered"].map((label) => (
            <div
              key={label}
              className="px-3 sm:px-4 py-2 glass rounded-full text-xs sm:text-sm text-foreground flex items-center gap-2
                transition-all hover:-translate-y-0.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gold"></span>
              <span className="whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
