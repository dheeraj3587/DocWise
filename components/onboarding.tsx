"use client";

import { type FormEvent, useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bumpParticleTypingImpulse,
  pulseParticleSubmitImpulse,
} from "@/components/particle-field";
import { AuthShell, useAuthTypingImpulse } from "./auth-shell";

const STEPS = ["Profile", "Invite", "Ready"] as const;

export function OnboardingShowcasePage() {
  return (
    <AuthShell variant="onboarding">
      <OnboardingFlow />
    </AuthShell>
  );
}

function OnboardingFlow() {
  const router = useRouter();
  const { signUp, fetchStatus } = useSignUp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [socialPending, setSocialPending] = useState<"google" | "apple" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [pendingEmail, setPendingEmail] = useState("");
  const typingImpulse = useAuthTypingImpulse();

  const next = () => {
    pulseParticleSubmitImpulse(typingImpulse);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finishSignup = async () => {
    if (!signUp || !name.trim() || !email.trim() || !password) return;
    const { firstName, lastName } = splitName(name);

    pulseParticleSubmitImpulse(typingImpulse);
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const { error: signUpError } = await signUp.password({
        emailAddress: email.trim().toLowerCase(),
        password,
        firstName,
        lastName,
      });

      if (signUpError) throw signUpError;

      if (signUp.status === "complete") {
        const { error: finalizeError } = await signUp.finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            const url = decorateUrl("/dashboard");
            if (url.startsWith("http")) window.location.href = url;
            else router.push(url);
          },
        });
        if (finalizeError) throw finalizeError;
        return;
      }

      if (signUp.unverifiedFields.includes("email_address")) {
        const { error: verifyError } =
          await signUp.verifications.sendEmailCode();
        if (verifyError) throw verifyError;
        setMessage(
          "Verification code sent. Check your email to finish signup.",
        );
        return;
      }

      setMessage("Signup started. Check your email to finish.");
    } catch (err) {
      setError(getClerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const socialSignup = async (provider: "google" | "apple") => {
    if (!signUp) return;

    pulseParticleSubmitImpulse(typingImpulse);
    setSocialPending(provider);
    setError(null);
    setMessage(null);

    try {
      const { error: ssoError } = await signUp.sso({
        strategy: provider === "google" ? "oauth_google" : "oauth_apple",
        redirectUrl: "/dashboard",
        redirectCallbackUrl: "/sso-callback",
        ...splitName(name),
      });

      if (ssoError) throw ssoError;
    } catch (err) {
      setError(getClerkErrorMessage(err));
      setSocialPending(null);
    }
  };

  return (
    <div
      className="w-full max-w-lg"
      onKeyDown={(e) => bumpParticleTypingImpulse(typingImpulse, e)}
    >
      <Stepper step={step} />

      {step === 0 ? (
        <ProfileStep
          value={name}
          email={email}
          password={password}
          pending={pending || fetchStatus === "fetching"}
          socialPending={socialPending}
          error={error}
          message={message}
          onChange={setName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onGoogle={() => socialSignup("google")}
          onApple={() => socialSignup("apple")}
          onSubmit={(e) => {
            e.preventDefault();
            void finishSignup();
          }}
        />
      ) : null}

      {step === 1 ? (
        <InviteStep
          invitees={invitees}
          pending={pendingEmail}
          onPendingChange={setPendingEmail}
          onAdd={(e) => {
            e.preventDefault();
            const trimmed = pendingEmail.trim().toLowerCase();
            if (!trimmed) return;
            if (invitees.includes(trimmed)) {
              setPendingEmail("");
              return;
            }
            setInvitees((prev) => [...prev, trimmed]);
            setPendingEmail("");
          }}
          onRemove={(email) =>
            setInvitees((prev) => prev.filter((e) => e !== email))
          }
          onContinue={next}
          onBack={back}
        />
      ) : null}

      {step === 2 ? (
        <ReadyStep name={name || "Untitled"} count={invitees.length} />
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase tracking-label">
      <span>
        Step {String(step + 1).padStart(2, "0")} / {STEPS.length}
      </span>
      <div className="ml-2 flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step
                ? "w-5 bg-foreground"
                : i < step
                  ? "w-1.5 bg-foreground/70"
                  : "w-1.5 bg-foreground/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ProfileStep({
  value,
  email,
  password,
  pending,
  socialPending,
  error,
  message,
  onChange,
  onEmailChange,
  onPasswordChange,
  onGoogle,
  onApple,
  onSubmit,
}: {
  value: string;
  email: string;
  password: string;
  pending: boolean;
  socialPending: "google" | "apple" | null;
  error: string | null;
  message: string | null;
  onChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onGoogle: () => void;
  onApple: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const disabled = pending || socialPending !== null;
  const canSubmit = Boolean(value.trim() && email.trim() && password);

  return (
    <>
      <div className="mt-8 font-mono text-[11px] text-muted-foreground uppercase tracking-label">
        Your name
      </div>
      <h1 className="mt-2 font-heading text-3xl leading-tight">
        What should we call you?
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        This uses your Clerk profile name.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-name">Name</Label>
          <Input
            id="onboarding-name"
            placeholder="Dheeraj Joshi"
            autoComplete="name"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            nativeInput
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-email">Email</Label>
          <Input
            id="onboarding-email"
            type="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            disabled={disabled}
            nativeInput
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-password">Password</Label>
          <Input
            id="onboarding-password"
            type="password"
            required
            placeholder="Create a password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={disabled}
            nativeInput
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit || disabled}
          loading={pending}
          className="mt-2"
        >
          Sign up
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-label">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="lg"
          type="button"
          loading={socialPending === "google"}
          disabled={disabled}
          onClick={onGoogle}
        >
          <GoogleIcon />
          Sign up with Google
        </Button>
        <Button
          variant="outline"
          size="lg"
          type="button"
          loading={socialPending === "apple"}
          disabled={disabled}
          onClick={onApple}
        >
          <AppleIcon />
          Sign up with Apple
        </Button>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 transition-colors hover:text-accent-foreground hover:underline"
        >
          Log in
        </Link>
      </p>

      {message ? (
        <div className="mt-4 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-muted-foreground text-sm">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {error}
        </div>
      ) : null}
    </>
  );
}

function InviteStep({
  invitees,
  pending,
  onPendingChange,
  onAdd,
  onRemove,
  onContinue,
  onBack,
}: {
  invitees: string[];
  pending: string;
  onPendingChange: (v: string) => void;
  onAdd: (e: FormEvent) => void;
  onRemove: (email: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="mt-8 font-mono text-[11px] text-muted-foreground uppercase tracking-label">
        Bring people with you
      </div>
      <h1 className="mt-2 font-heading text-3xl leading-tight">
        Invite teammates
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Optional — you can add anyone later.
      </p>

      <form onSubmit={onAdd} className="mt-8 flex gap-2">
        <Input
          type="email"
          placeholder="colleague@example.com"
          autoComplete="off"
          value={pending}
          onChange={(e) => onPendingChange(e.target.value)}
          nativeInput
        />
        <Button type="submit" variant="outline">
          Add
        </Button>
      </form>

      {invitees.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-1.5">
          {invitees.map((email) => (
            <li
              key={email}
              className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
            >
              <span className="truncate text-foreground/85">{email}</span>
              <button
                type="button"
                onClick={() => onRemove(email)}
                className="font-mono text-[10px] text-muted-foreground uppercase tracking-brand transition-colors hover:text-foreground"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-border bg-background/30 px-3 py-6 text-center text-muted-foreground text-xs">
          No invites yet. Add a few or skip — totally fine.
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" type="button" onClick={onBack}>
          Back
        </Button>
        <Button type="button" size="lg" onClick={onContinue}>
          {invitees.length === 0
            ? "Skip for now"
            : `Send ${invitees.length} invite${invitees.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </>
  );
}

function ReadyStep({ name, count }: { name: string; count: number }) {
  return (
    <>
      <div className="mt-8 font-mono text-[11px] text-muted-foreground uppercase tracking-label">
        You&apos;re set
      </div>
      <h1 className="mt-2 font-heading text-3xl leading-tight">
        Welcome, {name}.
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
        {count === 0
          ? "Quiet for now — when you're ready, invite people from settings."
          : `We've sent ${count} invite${count === 1 ? "" : "s"}. They'll show up here once accepted.`}
      </p>

      <div className="mt-8 grid grid-cols-3 gap-2">
        <FactCard label="Name" value={name} />
        <FactCard label="Members" value={String(count + 1)} />
        <FactCard label="Plan" value="Free" />
      </div>

      <Button size="lg" className="mt-8 w-full" type="button">
        Take me in
      </Button>
    </>
  );
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 px-3 py-3">
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-label">
        {label}
      </div>
      <div className="mt-1 truncate font-heading text-sm">{value}</div>
    </div>
  );
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

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const [firstName = "", ...rest] = parts;
  return {
    firstName,
    lastName: rest.length ? rest.join(" ") : undefined,
  };
}

function getClerkErrorMessage(err: unknown) {
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message?: unknown }).message);
  }
  return "Something went wrong. Please try again.";
}
