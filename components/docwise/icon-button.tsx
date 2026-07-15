import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function IconButton({
  className,
  active = false,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg border text-muted-foreground outline-none transition-[border-color,background-color,color,transform] duration-200 hover:border-foreground/20 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-foreground/16 bg-secondary text-foreground"
          : "border-transparent bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
