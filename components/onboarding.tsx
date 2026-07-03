"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bumpParticleTypingImpulse,
  pulseParticleSubmitImpulse,
} from "@/components/particle-field";
import { AuthShell, useAuthTypingImpulse } from "./auth-shell";

const STEPS = ["Workspace", "Invite", "Ready"] as const;

export function OnboardingShowcasePage() {
  return (
    <AuthShell variant="onboarding">
      <OnboardingFlow />
    </AuthShell>
  );
}

function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [workspace, setWorkspace] = useState("");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [pendingEmail, setPendingEmail] = useState("");
  const typingImpulse = useAuthTypingImpulse();

  const next = () => {
    pulseParticleSubmitImpulse(typingImpulse);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div
      className="w-full max-w-lg"
      onKeyDown={(e) => bumpParticleTypingImpulse(typingImpulse, e)}
    >
      <Stepper step={step} />

      {step === 0 ? (
        <WorkspaceStep
          value={workspace}
          onChange={setWorkspace}
          onSubmit={(e) => {
            e.preventDefault();
            if (!workspace.trim()) return;
            next();
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
        <ReadyStep workspace={workspace || "Untitled"} count={invitees.length} />
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.3em]">
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

function WorkspaceStep({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <>
      <div className="mt-8 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
        Create your workspace
      </div>
      <h1 className="mt-2 font-heading text-3xl leading-tight">
        Set up DocWise.
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Add your workspace details to start your account.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-workspace">Workspace name</Label>
          <Input
            id="onboarding-workspace"
            placeholder="My DocWise workspace"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            nativeInput
          />
        </div>
        <Button type="submit" size="lg" disabled={!value.trim()} className="mt-2">
          Continue
        </Button>
      </form>
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
      <div className="mt-8 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
        Add signup details
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
          placeholder="teammate@example.com"
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
              className="flex items-center justify-between rounded-md border border-border/70 bg-background/40 px-3 py-2 text-sm"
            >
              <span className="truncate text-foreground/85">{email}</span>
              <button
                type="button"
                onClick={() => onRemove(email)}
                className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] transition-colors hover:text-foreground"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-border/70 bg-background/30 px-3 py-6 text-center text-muted-foreground text-xs">
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

function ReadyStep({
  workspace,
  count,
}: {
  workspace: string;
  count: number;
}) {
  const router = useRouter();

  return (
    <>
      <div className="mt-8 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
        You're set
      </div>
      <h1 className="mt-2 font-heading text-3xl leading-tight">
        Welcome to {workspace}.
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
        {count === 0
          ? "Quiet for now — when you're ready, invite people from settings."
          : `We've saved ${count} invite${count === 1 ? "" : "s"}. They'll show up here once accepted.`}
      </p>

      <div className="mt-8 grid grid-cols-3 gap-2">
        <FactCard label="Workspace" value={workspace} />
        <FactCard label="Members" value={String(count + 1)} />
        <FactCard label="Plan" value="Free" />
      </div>

      <Button
        size="lg"
        className="mt-8 w-full"
        type="button"
        onClick={() => router.push("/login")}
      >
        Create account
      </Button>
    </>
  );
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background/40 px-3 py-3">
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
        {label}
      </div>
      <div className="mt-1 truncate font-heading text-sm">{value}</div>
    </div>
  );
}
