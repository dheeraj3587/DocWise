import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="h-full bg-background text-foreground">
      <div className="flex h-14 items-center justify-between border-b border-border pl-16 pr-4 sm:px-6 lg:px-8">
        <Skeleton className="h-5 w-36" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-8 rounded-lg" />
          <div className="hidden space-y-1.5 text-right sm:block">
            <Skeleton className="ml-auto h-3.5 w-20" />
            <Skeleton className="ml-auto h-2.5 w-16" />
          </div>
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </div>

      <main className="custom-scrollbar h-[calc(100%-3.5rem)] overflow-auto">
        <section className="mx-auto w-full max-w-[1560px] px-5 pb-12 pt-10 sm:px-8 lg:px-10 lg:pt-14">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-10 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-[min(520px,100%)]" />
          <Skeleton className="mt-7 h-12 w-[min(660px,100%)] rounded-lg border border-border bg-background/40" />
        </section>

        <section className="mx-auto w-full max-w-[1560px] border-t border-border px-5 pb-14 pt-10 sm:px-8 lg:px-10">
          <div className="mb-5">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="min-h-52 rounded-lg border border-border bg-background p-4"
              >
                <div className="mb-8 flex items-start justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="size-9 rounded-lg" />
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
