import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface TrackerProps {
  steps: string[];
  current: number;
  className?: string;
}

/**
 * Linear progress tracker for a lifecycle with a small, fixed number of
 * forward-only steps. Not for branching or exception states — those stay on
 * a `Callout` (§10, `taskStatusLabel`).
 */
export function Tracker({ steps, current, className }: TrackerProps) {
  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((step, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li key={step} className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                done && "border-success bg-success-wash text-success",
                now && "border-primary bg-primary text-primary-contrast",
                !done && !now && "border-border bg-bg text-subtle",
              )}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn("pt-0.5 text-sm", now ? "font-medium text-foreground" : "text-muted")}
            >
              {step}
              {now ? (
                <span className="ml-2 text-xs font-medium uppercase tracking-wide text-primary">
                  Now
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
