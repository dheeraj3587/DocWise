"use client";

import { type FormEvent, useRef, useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import {
  bumpParticleTypingImpulse,
  pulseParticleSubmitImpulse,
} from "@/components/particle-field";
import { AuthShell, useAuthTypingImpulse } from "./auth-shell";
import { AuthCheckEmailContent } from "./auth-check-email";

export function LoginShowcasePage() {
  return (
    <AuthShell variant="welcome">
      <LoginForm />
    </AuthShell>
  );
}

function LoginForm() {
  return (
    <>
      <div className="absolute top-6 left-6 flex items-center gap-2 font-mono text-sm lg:hidden">
        <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
        <span className="tracking-[0.2em] uppercase">DocWise</span>
      </div>

      <div className="w-full max-w-lg">
        <div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
          Welcome back
        </div>
        <h1 className="mt-2 font-heading text-3xl leading-tight">
          Open DocWise
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">Sign in to continue.</p>

        <MagicLinkForm />
        <OrSeparator />
        <OAuthButtons />
      </div>
    </>
  );
}

function OrSeparator() {
  return (
    <div className="my-6 flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.3em]">
        or
      </span>
      <Separator className="flex-1" />
    </div>
  );
}

function MagicLinkForm() {
  if (!hasClerkKey()) {
    return <DisabledMagicLinkForm />;
  }

  return <ClerkMagicLinkForm />;
}

function ClerkMagicLinkForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const typingImpulse = useAuthTypingImpulse();
  const { signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launchEmailLinkFlow = async (targetEmail: string) => {
    if (!signIn) {
      throw new Error("Authentication is still loading. Please try again in a moment.");
    }

    const normalizedEmail = targetEmail.trim().toLowerCase();
    const { error: sendLinkError } = await signIn.emailLink.sendLink({
      emailAddress: normalizedEmail,
      verificationUrl: `${window.location.origin}/login/verify`,
    });

    if (sendLinkError) throw sendLinkError;

    setSentTo(normalizedEmail);
    setPending(false);

    void signIn.emailLink.waitForVerification().then(async ({ error: verificationError }) => {
      if (verificationError) {
        setError(getClerkErrorMessage(verificationError));
        return;
      }

      if (signIn.status === "complete") {
        const { error: finalizeError } = await signIn.finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            const url = decorateUrl("/dashboard");
            if (url.startsWith("http")) {
              window.location.href = url;
            } else {
              router.push(url);
            }
          },
        });
        if (finalizeError) {
          setError(getClerkErrorMessage(finalizeError));
        }
      }
    });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;
    pulseParticleSubmitImpulse(typingImpulse);
    if (!signIn) {
      setError("Authentication is still loading. Please try again in a moment.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await launchEmailLinkFlow(email);
    } catch (err) {
      setError(getClerkErrorMessage(err));
      setSentTo(null);
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <>
        <AuthCheckEmailContent
          email={sentTo}
          onResendLink={async () => {
            setError(null);
            try {
              await launchEmailLinkFlow(sentTo);
            } catch (err) {
              setError(getClerkErrorMessage(err));
              throw err;
            }
          }}
          onUseDifferentEmail={() => {
            setSentTo(null);
            setError(null);
          }}
        />
        {error ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
            {error}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onKeyDown={(e) => bumpParticleTypingImpulse(typingImpulse, e)}
        className="mt-8 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="magic-link-email">Email</Label>
          <Input
            id="magic-link-email"
            type="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            nativeInput
          />
        </div>

        <Button type="submit" size="lg" loading={pending} disabled={pending} className="mt-2">
          Send sign-in link
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          <Kbd className="font-mono">⌘↵</Kbd> to submit
        </p>
      </form>
      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {error}
        </div>
      ) : null}
    </>
  );
}

function DisabledMagicLinkForm() {
  return (
    <div className="mt-8 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-muted-foreground text-sm">
      Clerk is not configured for this environment.
    </div>
  );
}

function OAuthButtons() {
  if (!hasClerkKey()) {
    return <OAuthButtonsContent disabled />;
  }

  return <ClerkOAuthButtons />;
}

function ClerkOAuthButtons() {
  const { signIn, fetchStatus } = useSignIn();
  const [pending, setPending] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authenticate = async (provider: "google" | "apple") => {
    if (!signIn) return;
    setError(null);
    setPending(provider);
    try {
      const { error: ssoError } = await signIn.sso({
        strategy: provider === "google" ? "oauth_google" : "oauth_apple",
        redirectUrl: "/dashboard",
        redirectCallbackUrl: "/sso-callback",
      });
      if (ssoError) throw ssoError;
    } catch (err) {
      setError(getClerkErrorMessage(err));
      setPending(null);
    }
  };

  return (
    <>
      <OAuthButtonsContent
        disabled={fetchStatus === "fetching" || pending !== null}
        googleLoading={pending === "google"}
        appleLoading={pending === "apple"}
        onGoogle={() => authenticate("google")}
        onApple={() => authenticate("apple")}
      />
      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {error}
        </div>
      ) : null}
    </>
  );
}

function OAuthButtonsContent({
  disabled = false,
  googleLoading = false,
  appleLoading = false,
  onGoogle,
  onApple,
}: {
  disabled?: boolean;
  googleLoading?: boolean;
  appleLoading?: boolean;
  onGoogle?: () => void;
  onApple?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="lg"
        type="button"
        disabled={disabled}
        loading={googleLoading}
        onClick={onGoogle}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      <Button
        variant="outline"
        size="lg"
        type="button"
        disabled={disabled}
        loading={appleLoading}
        onClick={onApple}
      >
        <AppleIcon />
        Continue with Apple
      </Button>
    </div>
  );
}

function hasClerkKey() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return !!key && key.length > 20 && !key.includes("placeholder");
}

function getClerkErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown }).errors)
  ) {
    const firstError = (error as { errors: Array<{ longMessage?: string; message?: string }> }).errors[0];
    return firstError?.longMessage || firstError?.message || "Unable to continue. Please try again.";
  }

  if (error instanceof Error) return error.message;

  return "Unable to continue. Please try again.";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95s2.63-5.95 5.85-5.95c1.84 0 3.07.78 3.77 1.45l2.57-2.5C16.71 3.8 14.59 2.9 12 2.9 6.97 2.9 2.9 6.97 2.9 12s4.07 9.1 9.1 9.1c5.26 0 8.74-3.69 8.74-8.89 0-.6-.06-1.05-.14-1.51Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="currentColor"
        d="M16.37 1.43c.06 1.2-.39 2.37-1.17 3.2-.8.85-2.08 1.5-3.28 1.41-.09-1.19.5-2.37 1.21-3.13.8-.88 2.16-1.52 3.24-1.48ZM20.5 17.33c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.53-4.12 3.54-1.54.02-1.94-1-4.03-.99-2.1.01-2.54 1-4.08.98-1.73-.02-3.06-1.78-4.05-3.35-2.77-4.4-3.06-9.56-1.35-12.31 1.21-1.95 3.12-3.1 4.91-3.1 1.82 0 2.97.99 4.47.99 1.46 0 2.35-1 4.45-1 1.59 0 3.27.86 4.47 2.36-3.93 2.15-3.29 7.76 1.06 9.92Z"
      />
    </svg>
  );
}
