"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import {
  EmailLinkErrorCodeStatus,
  isEmailLinkError,
} from "@clerk/nextjs/errors";

type VerificationStatus = "loading" | "verified" | "failed" | "expired" | "client_mismatch";

export default function LoginVerifyPage() {
  if (!hasClerkKey()) {
    return <VerifyShell message="Clerk is not configured for this environment." />;
  }

  return <ClerkLoginVerifyPage />;
}

function ClerkLoginVerifyPage() {
  const { handleEmailLinkVerification, loaded } = useClerk();
  const [status, setStatus] = useState<VerificationStatus>("loading");

  useEffect(() => {
    if (!loaded) return;

    async function verify() {
      try {
        await handleEmailLinkVerification({
          redirectUrl: "/login",
          redirectUrlComplete: "/dashboard",
        });
        setStatus("verified");
      } catch (err) {
        if (isEmailLinkError(err as Error)) {
          if ((err as Error & { code?: string }).code === EmailLinkErrorCodeStatus.Expired) {
            setStatus("expired");
            return;
          }
          if ((err as Error & { code?: string }).code === EmailLinkErrorCodeStatus.ClientMismatch) {
            setStatus("client_mismatch");
            return;
          }
        }

        setStatus("failed");
      }
    }

    verify();
  }, [handleEmailLinkVerification, loaded]);

  if (status === "loading") {
    return <VerifyShell message="Checking your sign-in link..." />;
  }

  if (status === "verified") {
    return <VerifyShell message="Email verified. Return to the original tab to continue." />;
  }

  if (status === "expired") {
    return <VerifyShell message="This sign-in link has expired." showBackLink />;
  }

  if (status === "client_mismatch") {
    return <VerifyShell message="Open this link in the same browser where you requested it." showBackLink />;
  }

  return <VerifyShell message="The email link verification failed." showBackLink />;
}

function VerifyShell({
  message,
  showBackLink = false,
}: {
  message: string;
  showBackLink?: boolean;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border/70 bg-background/60 p-6 text-sm shadow-sm">
        <h1 className="font-heading text-2xl">Verify your email</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
        {showBackLink ? (
          <Link href="/login" className="mt-5 inline-flex font-medium underline-offset-4 hover:underline">
            Back to login
          </Link>
        ) : null}
      </div>
    </main>
  );
}

function hasClerkKey() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return !!key && key.length > 20 && !key.includes("placeholder");
}
