import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "active" | "pending" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface text-muted border-border",
  active: "bg-success-wash text-success border-success/20",
  pending: "bg-warning-wash text-warning border-warning/25",
  warning: "bg-warning-wash text-warning border-warning/25",
  danger: "bg-danger-wash text-danger border-danger/25",
  info: "bg-info-wash text-info border-mist/60",
};

interface StatusPillProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/**
 * Medical-label style status badge (Ease Health reference). Always carries a
 * text label and a leading dot — never colour alone (NFR-A11Y-001).
 */
export function StatusPill({ tone = "neutral", children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** A plain-language label for a route status (§22). */
export function routeStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PENDING_VERIFICATION":
      return "Awaiting operator check";
    case "ACTIVE":
      return "Available to customers";
    case "PAUSED":
      return "Paused";
    case "ARCHIVED":
      return "Archived";
    default:
      return status.replace(/_/g, " ").toLowerCase();
  }
}

/** Map a route lifecycle status to a pill tone. */
export function routeStatusTone(status: string): Tone {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "PENDING_VERIFICATION":
      return "pending";
    case "PAUSED":
      return "warning";
    case "ARCHIVED":
      return "danger";
    default:
      return "neutral";
  }
}

/** Map a task lifecycle status to a pill tone. */
export function taskStatusTone(status: string): Tone {
  switch (status) {
    case "HANDOFF_READY":
      return "active";
    case "RECOMMENDED":
    case "AWAITING_QUOTE":
    case "SUBMITTED":
      return "pending";
    case "FAILED":
      return "danger";
    case "CANCELLED":
      return "neutral";
    default:
      return "neutral";
  }
}

/** A plain-language label for a task status — never the raw enum (§10, §22). */
export function taskStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SUBMITTED":
      return "Sent";
    case "AWAITING_QUOTE":
      return "Waiting for a price";
    case "RECOMMENDED":
      return "Quote ready — your decision";
    case "HANDOFF_READY":
      return "Ready to send";
    case "FAILED":
      return "Closed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ").toLowerCase();
  }
}
