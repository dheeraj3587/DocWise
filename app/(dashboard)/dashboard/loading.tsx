import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border px-6 py-5 sm:px-10">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
      <main className="px-6 pt-12 sm:px-10">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-10 w-64 mb-2" />
        <Skeleton className="h-5 w-96 mb-6" />
        <Skeleton className="h-12 w-full max-w-[620px] rounded-lg mb-10" />
        <div className="grid grid-cols-1 gap-[18px] min-[700px]:grid-cols-2 min-[1180px]:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-background/40 p-[18px]">
              <div className="mb-8 flex items-start justify-between">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="size-[38px] rounded-lg" />
              </div>
              <Skeleton className="mb-2 h-4 w-3/4" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-8 h-px w-full" />
              <Skeleton className="mt-3 h-4 w-40" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
