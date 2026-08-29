import type { ButtonHTMLAttributes } from "react";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  pending?: boolean;
  block?: boolean;
}

const variants = {
  primary: "bg-primary text-primary-contrast hover:bg-primary-hover",
  secondary: "border border-border-strong bg-bg text-foreground hover:bg-surface",
  ghost: "text-muted hover:bg-surface hover:text-foreground",
  danger: "border border-danger/30 bg-danger-wash text-danger hover:bg-danger/10",
};

const sizes = {
  sm: "min-h-9 px-3 text-sm gap-1.5",
  md: "min-h-11 px-5 text-sm gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  pending = false,
  block = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium tracking-normal transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "active:scale-[0.98] motion-reduce:active:scale-100",
        variants[variant],
        sizes[size],
        block ? "w-full" : "w-full sm:w-auto",
        className,
      )}
      disabled={disabled ?? pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
