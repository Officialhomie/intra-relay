import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Definition list for record detail (business/route/quote fields). */
export function DataList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border rounded-md border border-border", className)}>
      {children}
    </dl>
  );
}

export function DataRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words text-sm text-foreground sm:text-right">
        {children}
        {hint ? <span className="mt-0.5 block text-xs text-subtle">{hint}</span> : null}
      </dd>
    </div>
  );
}
