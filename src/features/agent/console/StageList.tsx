import { Check, CircleDashed, Loader2, MinusCircle, PauseCircle, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type { RunStage } from "./types";

/**
 * The semantic progress spine.
 *
 * Every asynchronous state carries meaning — there is no bare spinner anywhere
 * in this list. Status is conveyed by an icon AND a word, never colour alone
 * (NFR-A11Y-001), and the whole list is an ordered list so a screen reader
 * announces position.
 */

const ICONS = {
  done: Check,
  active: Loader2,
  waiting: PauseCircle,
  "needs-you": PauseCircle,
  blocked: X,
  skipped: MinusCircle,
  pending: CircleDashed,
} as const;

const STATUS_WORD: Record<RunStage["status"], string> = {
  done: "done",
  active: "in progress",
  waiting: "waiting",
  "needs-you": "needs you",
  blocked: "stopped here",
  skipped: "not needed",
  pending: "not started",
};

const TONE: Record<RunStage["status"], string> = {
  done: "text-success",
  active: "text-primary",
  waiting: "text-warning",
  "needs-you": "text-primary",
  blocked: "text-danger",
  skipped: "text-subtle",
  pending: "text-subtle",
};

const LABEL_TONE: Record<RunStage["status"], string> = {
  done: "text-foreground",
  active: "text-foreground font-medium",
  waiting: "text-foreground font-medium",
  "needs-you": "text-foreground font-medium",
  blocked: "text-foreground font-medium",
  skipped: "text-subtle line-through decoration-border",
  pending: "text-subtle",
};

export function StageList({ stages }: { stages: RunStage[] }) {
  return (
    <ol className="space-y-2.5">
      {stages.map((stage) => {
        const Icon = ICONS[stage.status];
        return (
          <li key={stage.key} className="flex items-start gap-2.5">
            <Icon
              aria-hidden
              className={cn(
                "mt-0.5 size-4 shrink-0",
                TONE[stage.status],
                stage.status === "active" && "animate-spin motion-reduce:animate-none",
              )}
            />
            <div className="min-w-0">
              <p className={cn("text-sm leading-snug", LABEL_TONE[stage.status])}>
                {stage.label}
                <span className="sr-only"> — {STATUS_WORD[stage.status]}</span>
              </p>
              {stage.detail ? (
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{stage.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
