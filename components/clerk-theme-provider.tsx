"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "@/components/theme-provider"
import { useSyncExternalStore } from "react"

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const emptySubscribe = () => () => {}
const returnTrue = () => true
const returnFalse = () => false

/**
 * Validates that the Clerk publishable key is a real key, not a placeholder.
 * During CI builds the env var may be absent or set to a placeholder value,
 * which would crash static-page prerendering (e.g. /_not-found).
 */
function hasValidClerkKey(): boolean {
  return (
    !!clerkPubKey &&
    clerkPubKey.length > 20 &&
    !clerkPubKey.includes("placeholder")
  )
}

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme()
  const mounted = useSyncExternalStore(emptySubscribe, returnTrue, returnFalse)

  const isDark = mounted ? resolved === "dark" : true

  // Skip ClerkProvider when key is missing/invalid (CI builds, previews)
  if (!hasValidClerkKey()) {
    return <>{children}</>
  }

  return (
    <ClerkProvider
      dynamic
      signInUrl="/login"
      signUpUrl="/sign-up"
      appearance={isDark ? { theme: dark } : undefined}
    >
      {children}
    </ClerkProvider>
  )
}
