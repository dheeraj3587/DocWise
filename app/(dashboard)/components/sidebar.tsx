"use client";
import {
  Upload,
  Menu,
  X,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "./file-upload";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useApiQuery } from "@/lib/hooks";
import { FileRecord } from "@/lib/api-client";

export const Sidebar = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const path = usePathname();
  const router = useRouter();

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  const { data: getAllFiles } = useApiQuery<FileRecord[]>(
    email ? `/api/files?user_email=${encodeURIComponent(email)}` : null,
    [email],
  );

  const progressValue =
    getAllFiles && getAllFiles.length ? (getAllFiles.length / 5) * 100 : 0;

  const openChat = () => {
    window.dispatchEvent(new CustomEvent("docwise:focus-chat"));
    setSidebarOpen(false);
  };

  if (!sidebarVisible) {
    return (
      <button
        type="button"
        onClick={() => setSidebarVisible(true)}
        className="fixed left-4 top-24 z-50 grid size-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Show side panel"
      >
        <PanelLeftOpen className="size-4" />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 grid size-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/70 backdrop-blur-sm z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-72
          bg-background
          border-r border-border
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          flex flex-col
        `}
      >
        <div
          onClick={() => router.push("/")}
          className="flex h-[73px] cursor-pointer items-center justify-between border-b border-border px-6"
        >
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="inline-block size-2 rounded-full bg-foreground" />
            <span className="tracking-[0.2em] uppercase">DocWise</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarVisible(false);
              setSidebarOpen(false);
            }}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Hide side panel"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          <button
            onClick={() => router.push("/dashboard")}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${path === "/dashboard"
                ? "border-border bg-background/40 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>
          <button
            type="button"
            onClick={openChat}
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MessageSquare size={18} />
            <span>Chat</span>
          </button>

          <FileUpload>
            <Button
              className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
            >
              <Upload size={18} />
              <span>Upload File</span>
            </Button>
          </FileUpload>
        </nav>

        <div className="space-y-4 border-t border-border p-6">
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                Storage
              </span>
              <span className="text-sm font-semibold text-foreground">
                {getAllFiles?.length || 0} documents
              </span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>
        </div>
      </aside>
    </>
  );
};
