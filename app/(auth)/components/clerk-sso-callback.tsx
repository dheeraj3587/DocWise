"use client"

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"

const hasClerkKey =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 20 &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes("placeholder")

export function ClerkSSOCallback() {
  if (!hasClerkKey) {
    return (
      <main className="bg-mesh flex min-h-screen items-center justify-center px-4 text-center">
        <div className="max-w-sm rounded-2xl border border-border bg-card/70 p-6 text-sm text-muted-foreground shadow-sm backdrop-blur">
          Clerk is not configured for this environment.
        </div>
      </main>
    )
  }

  return <AuthenticateWithRedirectCallback />
}
