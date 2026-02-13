"use client";
import {
  Upload,
  FileText,
  User,
  Menu,
  X,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "./file-upload";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/clerk-react";
import { useApiQuery } from "@/lib/hooks";
import { FileRecord } from "@/lib/api-client";

interface UserData {
  email: string;
  name: string;
}

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
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white shadow-lg"
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-72 bg-white border-r border-slate-200
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          flex flex-col
        `}
      >
        {/* Logo */}
        <div
          onClick={() => router.push("/")}
          className="h-16 flex items-center px-6 border-b border-slate-200 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-slate-900">DocWise</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-5">
          <button
            onClick={() => router.push("/dashboard")}
            className={
              path === "/dashboard"
                ? "flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-100 text-slate-900 w-full hover:bg-slate-200 transition-colors font-medium text-sm"
                : "flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 w-full hover:bg-slate-100 transition-colors font-medium text-sm group border-b border-t border-slate-200"
            }
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          <FileUpload>
            <Button
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer font-medium text-sm"
            >
              <Upload size={18} />
              <span>Upload File</span>
            </Button>
          </FileUpload>
        </nav>

        {/* Storage Info */}
        <div className="p-6 border-t border-slate-200 space-y-4">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">
                Storage
              </span>
              <span className="text-sm font-semibold text-slate-900">
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
