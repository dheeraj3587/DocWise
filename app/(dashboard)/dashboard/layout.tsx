export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { Sidebar } from "../components/sidebar";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

export default DashboardLayout;
