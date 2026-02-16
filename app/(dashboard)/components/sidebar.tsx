"use client";
import {
  Upload,
  Menu,
  X,
  LayoutDashboard,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "./file-upload";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/clerk-react";
import { useApiQuery } from "@/lib/hooks";
import { FileRecord } from "@/lib/api-client";

export const Sidebar = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  return (
    <>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl glass"
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
          w-72 glass-strong
          bg-sidebar/90
          border-r border-border
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          flex flex-col
        `}
      >
        {/* Logo */}
        <div
          onClick={() => router.push("/")}
          className="h-16 flex items-center px-6 border-b border-border cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="DocWise Logo" className="h-8 w-auto object-contain" />
            <span className="text-xl font-semibold text-foreground">DocWise</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-5">
          <button
            onClick={() => router.push("/dashboard")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl w-full transition-all font-medium text-sm ${
              path === "/dashboard"
                ? "surface-3 text-foreground glow-gold-subtle border border-gold/20 dark:border-gold/10"
                : "text-muted-foreground hover:text-foreground hover:surface-2"
            }`}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          <FileUpload>
            <Button
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full font-medium text-sm"
            >
              <Upload size={18} />
              <span>Upload File</span>
            </Button>
          </FileUpload>
        </nav>

        {/* Storage Info */}
        <div className="p-6 border-t border-border space-y-4">
          <div className="p-4 rounded-xl surface-2 border border-border">
            <div className="flex items-center justify-between mb-3">
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
