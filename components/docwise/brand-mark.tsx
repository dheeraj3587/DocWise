import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  compact?: boolean;
  href?: string;
};

export function BrandMark({
  className,
  compact = false,
  href = "/dashboard",
}: BrandMarkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5 text-foreground",
        className,
      )}
      aria-label="DocWise dashboard"
    >
      <span className="relative grid size-6 shrink-0 place-items-center">
        <span className="absolute size-2 rounded-full bg-foreground" />
        <span className="absolute size-4 rounded-full border border-foreground/18" />
      </span>
      {!compact ? (
        <span className="font-heading text-[13px] uppercase">DocWise</span>
      ) : null}
    </Link>
  );
}
