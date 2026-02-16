"use client";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-mesh text-foreground">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-2xl glass border-gold/20 glow-gold-subtle">
            <Compass className="w-8 h-8 text-gold" />
          </div>
        </div>
        <h1 className="text-6xl font-bold tracking-tight mb-2">404</h1>
        <p className="text-lg text-muted-foreground mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="w-16 h-px bg-gold/40 mx-auto mb-6" />
        <Button variant="ghost" onClick={() => router.push("/")}>
          <ArrowLeft size={16} />
          Back to Home
        </Button>
      </div>
    </div>
  );
}
