import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="h-screen bg-background text-foreground">
      <div className="flex h-[73px] items-center justify-between border-b border-border py-5 pl-16 pr-6 sm:pr-10 lg:px-10">
        <Skeleton className="h-5 w-36" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-8 rounded-lg" />
          <div className="hidden space-y-1.5 text-right sm:block">
            <Skeleton className="ml-auto h-3.5 w-20" />
            <Skeleton className="ml-auto h-2.5 w-16" />
          </div>
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>

      <main className="custom-scrollbar h-[calc(100vh-73px)] overflow-auto">
        <section className="px-6 pb-2 pt-12 sm:px-10">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-10 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-[min(520px,100%)]" />
          <Skeleton className="mt-7 h-11 w-[min(620px,100%)] rounded-lg border border-border bg-background/40" />
        </section>

        <section className="px-6 pb-14 pt-10 sm:px-10">
          <div className="mb-5">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>

          <div className="grid grid-cols-1 gap-[18px] min-[700px]:grid-cols-2 min-[1180px]:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-border bg-background/40 p-[18px]"
              >
                <div className="mb-8 flex items-start justify-between">
                  <Skeleton className="h-7 w-24 rounded-full" />
                  <Skeleton className="size-[38px] rounded-lg" />
                </div>
                <Skeleton className="mb-2 h-4 w-4/5" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-8 h-px w-full" />
                <Skeleton className="mt-3 h-4 w-36" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
