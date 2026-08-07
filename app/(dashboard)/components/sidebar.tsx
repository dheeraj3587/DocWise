"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  X,
} from "lucide-react";

import { BrandMark } from "@/components/docwise/brand-mark";
import { IconButton } from "@/components/docwise/icon-button";
import { Meter } from "@/components/docwise/meter";
import { SectionLabel } from "@/components/docwise/section-label";
import { Button } from "@/components/ui/button";
import { type UploadCountResponse } from "@/lib/api-client";
import { useApiQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { FileUpload } from "./file-upload";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  // The meter tracks the *daily upload quota*, not library size — those are
  // different numbers, and the library count made the bar read "12/5".
  const { data: uploadCount } = useApiQuery<UploadCountResponse>(
    email ? "/api/files/upload-count" : null,
    [email],
    { revalidateOnFocus: true },
  );
  const dailyLimit = uploadCount?.limit ?? 5;
  const usedToday = uploadCount?.count ?? 0;
  const progressValue = dailyLimit > 0 ? (usedToday / dailyLimit) * 100 : 0;

  return (
    <>
      <IconButton
        onClick={() => setMobileOpen((open) => !open)}
        className="fixed left-3 top-3 z-50 bg-background lg:hidden"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        title={mobileOpen ? "Close navigation" : "Open navigation"}
      >
        {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </IconButton>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-foreground/24 lg:hidden dark:bg-background/72"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-background transition-[width,transform] duration-200 lg:static lg:translate-x-0",
          collapsed ? "lg:w-16" : "lg:w-60",
          "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border px-3",
            collapsed ? "lg:justify-center" : "justify-between",
          )}
        >
          <BrandMark compact={collapsed} className="min-w-0" />
          <IconButton
            onClick={() => setCollapsed((value) => !value)}
            className={cn("size-8", collapsed && "lg:hidden")}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            <PanelLeftClose className="size-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
          <SectionLabel className={cn("mb-2 px-2", collapsed && "lg:hidden")}>
            Workspace
          </SectionLabel>
          <nav className="space-y-1" aria-label="Primary navigation">
            {navigation.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                >
                  {active ? (
                    <span className="absolute inset-y-2 left-0 w-px bg-foreground" />
                  ) : null}
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className={cn(collapsed && "lg:hidden")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-border pt-4">
            <FileUpload>
              <Button
                size="lg"
                className={cn(
                  "w-full justify-start px-3",
                  collapsed && "lg:justify-center lg:px-0",
                )}
                title={collapsed ? "Upload file" : undefined}
              >
                <Upload className="size-4" />
                <span className={cn(collapsed && "lg:hidden")}>
                  Upload file
                </span>
              </Button>
            </FileUpload>
          </div>
        </div>

        <div className="border-t border-border p-3">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="hidden h-10 w-full place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:grid"
              aria-label="Expand navigation"
              title="Expand navigation"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          ) : (
            <Meter
              className="px-1 py-2"
              label="Daily uploads"
              caption={`${usedToday}/${dailyLimit}`}
              value={progressValue}
              warnAtLimit
            />
          )}
        </div>
      </aside>
    </>
  );
}
