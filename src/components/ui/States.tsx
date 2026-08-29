import type { ComponentType, ReactNode } from "react";

import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-md bg-primary-wash text-primary">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("bg-border/60 animate-pulse rounded-md motion-reduce:animate-none", className)}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-5">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/** Full-panel loading placeholder with an accessible live-region label. */
export function LoadingPanel({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="border-danger/25 rounded-md border bg-danger-wash p-5 text-sm text-danger"
    >
      <p className="font-medium">{title}</p>
      {description ? <p className="text-danger/90 mt-1">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
