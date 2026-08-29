import type { ButtonHTMLAttributes } from "react";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  pending?: boolean;
}

export function Button({
  variant = "primary",
  pending = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto",
        variant === "primary" && "bg-primary text-primary-contrast hover:opacity-90",
        variant === "secondary" && "border border-border bg-surface text-foreground hover:bg-bg",
        className,
      )}
      disabled={disabled ?? pending}
      aria-busy={pending}
      {...props}
    >
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
