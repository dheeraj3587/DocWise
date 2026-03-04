"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => { }
const returnTrue = () => true
const returnFalse = () => false

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(emptySubscribe, returnTrue, returnFalse)

  if (!mounted) {
    return (
      <div className={`w-9 h-9 rounded-xl ${className}`} />
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`relative w-9 h-9 rounded-xl flex-center transition-all duration-300 cursor-pointer
        ${isDark
          ? "surface-2 hover:surface-3 border border-border text-accent-foreground"
          : "surface-1 hover:surface-2 border border-border text-muted-foreground hover:text-foreground shadow-xs"
        } ${className}`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  )
}
