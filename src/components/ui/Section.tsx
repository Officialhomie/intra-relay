import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Pill eyebrow stacked above a light serif heading (Ease Health signature). */
export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="space-y-2">
        {eyebrow ? (
          <span className="bg-mist/50 inline-flex rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide text-info">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="max-w-prose text-2xl font-light tracking-tight text-foreground">{title}</h1>
        {description ? <p className="max-w-prose text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Tag className={cn("rounded-md border border-border bg-surface p-5", className)}>
      {children}
    </Tag>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-base font-medium tracking-normal text-foreground", className)}>
      {children}
    </h2>
  );
}
