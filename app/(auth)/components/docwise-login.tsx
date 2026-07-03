"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, type KeyboardEvent, useMemo, useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { ArrowRight, BookOpenCheck, Check, Loader2, Mail, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const hasClerkKey =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 20 &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes("placeholder")

type AuthStep = "email" | "code"

export function DocWiseLogin() {
  if (!hasClerkKey) {
    return (
      <AuthShell>
        <DisabledLoginPanel />
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <LoginPanel />
    </AuthShell>
  )
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const pageMarkers = useMemo(
    () => [
      "Lecture notes",
      "Research PDF",
      "Timestamped video",
      "Citation draft",
      "Exam summary",
      "Project brief",
    ],
    []
  )

  return (
    <main className="bg-mesh relative min-h-screen overflow-hidden px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.22]">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
        <div className="absolute left-0 top-1/3 h-px w-full bg-border" />
        <div className="absolute bottom-12 left-8 right-8 h-px bg-border" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-7xl grid-cols-1 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/55 shadow-[0_24px_90px_rgba(0,0,0,0.12)] backdrop-blur-2xl lg:grid-cols-[1.06fr_0.94fr]">
        <section className="relative hidden min-h-[720px] border-r border-border/70 p-8 lg:block">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card/80 shadow-sm">
              <BookOpenCheck className="size-5 text-gold" />
            </div>
            <div>
              <div className="text-lg font-semibold">DocWise</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                Study workspace
              </div>
            </div>
          </div>

          <div className="absolute inset-x-8 top-32">
            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                <Sparkles className="size-3 text-gold" />
                your documents, ready
              </div>
              <h1 className="text-6xl font-semibold leading-[0.95] tracking-normal">
                Return to the page where your thinking left off.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
                Sign in to continue reading, annotate source material, and keep every note tied to the file that sparked it.
              </p>
            </div>
          </div>

          <div className="absolute bottom-8 left-8 right-8">
            <div className="grid grid-cols-2 gap-3">
              {pageMarkers.map((marker, index) => (
                <div
                  key={marker}
                  className={cn(
                    "rounded-xl border border-border/70 bg-card/55 p-4 shadow-sm backdrop-blur",
                    index === 1 || index === 4 ? "translate-y-5" : ""
                  )}
                >
                  <div className="mb-4 h-1.5 w-16 rounded-full bg-gold/60" />
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {marker}
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-2 rounded-full bg-foreground/18" />
                    <div className="h-2 w-4/5 rounded-full bg-foreground/10" />
                    <div className="h-2 w-2/3 rounded-full bg-foreground/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative flex min-h-[calc(100vh-2.5rem)] items-center justify-center p-5 sm:p-8 lg:min-h-[720px]">
          <div className="absolute left-5 top-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground lg:hidden">
            <span className="inline-flex size-2 rounded-full bg-gold" />
            DocWise
          </div>
          {children}
        </section>
      </div>
    </main>
  )
}

function DisabledLoginPanel() {
  return (
    <LoginFrame>
      <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Clerk is not configured for this environment.
      </div>
    </LoginFrame>
  )
}

function LoginPanel() {
  const router = useRouter()
  const { isLoaded, signIn, setActive } = useSignIn()
  const [step, setStep] = useState<AuthStep>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [pending, setPending] = useState<"email" | "code" | "google" | "apple" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const clerkReady = isLoaded

  const finishIfComplete = async (createdSessionId: string | null) => {
    if (!createdSessionId || !setActive) return false

    await setActive({ session: createdSessionId })
    router.push("/dashboard")
    return true
  }

  const onEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!clerkReady || !signIn) return

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    setPending("email")
    setError(null)

    try {
      const createdSignIn = await signIn.create({ identifier: normalizedEmail })

      if (await finishIfComplete(createdSignIn.createdSessionId)) return

      const emailCodeFactor = createdSignIn.supportedFirstFactors?.find(
        (factor) => factor.strategy === "email_code"
      )

      if (!emailCodeFactor || !("emailAddressId" in emailCodeFactor)) {
        throw new Error("Email code sign-in is not enabled for this Clerk project.")
      }

      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailCodeFactor.emailAddressId,
      })

      setSentTo(normalizedEmail)
      setStep("code")
    } catch (err) {
      setError(getClerkErrorMessage(err))
    } finally {
      setPending(null)
    }
  }

  const onCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!clerkReady || !signIn) return

    const trimmedCode = code.trim()
    if (!trimmedCode) return

    setPending("code")
    setError(null)

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: trimmedCode,
      })

      if (result.status !== "complete") {
        throw new Error("A second verification step is required for this account.")
      }

      await finishIfComplete(result.createdSessionId)
    } catch (err) {
      setError(getClerkErrorMessage(err))
    } finally {
      setPending(null)
    }
  }

  const onOAuth = async (provider: "google" | "apple") => {
    if (!clerkReady || !signIn) return

    setPending(provider)
    setError(null)

    try {
      await signIn.authenticateWithRedirect({
        strategy: provider === "google" ? "oauth_google" : "oauth_apple",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      })
    } catch (err) {
      setError(getClerkErrorMessage(err))
      setPending(null)
    }
  }

  const submitOnMetaEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.currentTarget.requestSubmit()
    }
  }

  return (
    <LoginFrame>
      {step === "email" ? (
        <form onSubmit={onEmailSubmit} onKeyDown={submitOnMetaEnter} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="docwise-login-email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="docwise-login-email"
                type="email"
                required
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!clerkReady || pending !== null}
                className="h-12 rounded-xl bg-card/70 pl-10"
              />
            </div>
          </div>

          <Button type="submit" size="lg" disabled={!clerkReady || pending !== null} className="h-12 rounded-xl">
            {pending === "email" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Send verification code
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">⌘↵</kbd>{" "}
            to submit
          </p>
        </form>
      ) : (
        <form onSubmit={onCodeSubmit} onKeyDown={submitOnMetaEnter} className="mt-8 flex flex-col gap-4">
          <div className="rounded-xl border border-border/70 bg-card/55 px-4 py-3 text-sm text-muted-foreground">
            <Check className="mr-2 inline size-4 text-gold" />
            Code sent to <span className="text-foreground">{sentTo}</span>.
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="docwise-login-code">Verification code</Label>
            <Input
              id="docwise-login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={!clerkReady || pending !== null}
              className="h-12 rounded-xl bg-card/70 text-center font-mono text-lg tracking-[0.35em]"
            />
          </div>

          <Button type="submit" size="lg" disabled={!clerkReady || pending !== null} className="h-12 rounded-xl">
            {pending === "code" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Continue
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => {
              setStep("email")
              setCode("")
              setError(null)
            }}
          >
            Use a different email
          </Button>
        </form>
      )}

      <div className="my-7 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-2">
        <Button
          variant="outline"
          size="lg"
          type="button"
          disabled={!clerkReady || pending !== null}
          onClick={() => onOAuth("google")}
          className="h-12 rounded-xl"
        >
          {pending === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </Button>
        <Button
          variant="outline"
          size="lg"
          type="button"
          disabled={!clerkReady || pending !== null}
          onClick={() => onOAuth("apple")}
          className="h-12 rounded-xl"
        >
          {pending === "apple" ? <Loader2 className="size-4 animate-spin" /> : <AppleIcon />}
          Continue with Apple
        </Button>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <p className="mt-7 text-center text-sm text-muted-foreground">
        New to DocWise?{" "}
        <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </LoginFrame>
  )
}

function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-lg">
      <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Welcome back
      </div>
      <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
        Open your DocWise desk
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Continue to your notes, files, transcripts, and AI study sessions.
      </p>
      {children}
    </div>
  )
}

function getClerkErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown }).errors)
  ) {
    const firstError = (error as { errors: Array<{ longMessage?: string; message?: string }> }).errors[0]
    return firstError?.longMessage || firstError?.message || "Unable to continue. Please try again."
  }

  if (error instanceof Error) return error.message

  return "Unable to continue. Please try again."
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95s2.63-5.95 5.85-5.95c1.84 0 3.07.78 3.77 1.45l2.57-2.5C16.71 3.8 14.59 2.9 12 2.9 6.97 2.9 2.9 6.97 2.9 12s4.07 9.1 9.1 9.1c5.26 0 8.74-3.69 8.74-8.89 0-.6-.06-1.05-.14-1.51Z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="currentColor"
        d="M16.37 1.43c.06 1.2-.39 2.37-1.17 3.2-.8.85-2.08 1.5-3.28 1.41-.09-1.19.5-2.37 1.21-3.13.8-.88 2.16-1.52 3.24-1.48ZM20.5 17.33c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.53-4.12 3.54-1.54.02-1.94-1-4.03-.99-2.1.01-2.54 1-4.08.98-1.73-.02-3.06-1.78-4.05-3.35-2.77-4.4-3.06-9.56-1.35-12.31 1.21-1.95 3.12-3.1 4.91-3.1 1.82 0 2.97.99 4.47.99 1.46 0 2.35-1 4.45-1 1.59 0 3.27.86 4.47 2.36-3.93 2.15-3.29 7.76 1.06 9.92Z"
      />
    </svg>
  )
}
