import { Skeleton } from "@/components/ui/skeleton";

export const WorkspaceSkeleton = () => {
  return (
    <div className="dark flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-[73px] shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-72 max-w-[44vw]" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[300px] shrink-0 border-r border-border p-4 lg:block">
          <Skeleton className="h-3 w-28" />
          <div className="mt-6 rounded-2xl border border-border bg-background/40 p-4">
            <Skeleton className="size-10 rounded-lg" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-border p-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-2.5 w-full" />
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 items-start justify-center overflow-hidden bg-secondary/25 px-8 py-6">
            <div className="w-full max-w-3xl space-y-4">
              <Skeleton className="mx-auto h-[72vh] w-full rounded-sm bg-background" />
              <Skeleton className="mx-auto h-3 w-56" />
            </div>
          </div>

          <aside className="hidden h-full w-[min(520px,34vw)] min-w-[420px] shrink-0 border-l border-border lg:flex lg:flex-col">
            <div className="border-b border-border px-4 py-3">
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="mt-2 h-3 w-44" />
            </div>
            <div className="flex flex-1 items-center justify-center p-4">
              <div className="w-full max-w-sm text-center">
                <Skeleton className="mx-auto size-10 rounded-full" />
                <Skeleton className="mx-auto mt-4 h-4 w-36" />
                <Skeleton className="mx-auto mt-2 h-3 w-52" />
              </div>
            </div>
            <div className="p-4">
              <Skeleton className="h-28 w-full rounded-[24px] border border-border bg-background/40" />
              <div className="mt-3 flex items-center justify-between">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};
