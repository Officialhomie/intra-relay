"use client";

import { Loader2 } from "lucide-react";

import { Disclosure } from "@/components/ui/Disclosure";

import { StageList } from "./StageList";
import type { AgentRun } from "./types";

/**
 * The one persistent context surface for the buyer's current work (frontend
 * audit Priority 7 — Direction B, with Direction C's compact status line).
 *
 * Exactly two states, nothing in between. No active run: a single quiet line
 * asking what the person needs — no eyebrow, no paragraph, no repeated trust
 * pitch (the conversation's own first message already carries that). An
 * active run: one compact row built from the SAME `headline`/`progress` the
 * run already computes — never a second state machine — collapsed by
 * default, expanding on demand into the existing `StageList`. Nothing here
 * grows with the conversation; it is a fixed one- or two-row surface either
 * way.
 */

function progressPhrase(run: AgentRun): string {
  const { quotesRequested, quotesReceived } = run.progress;
  const waiting = Math.max(0, quotesRequested - quotesReceived);

  if (quotesRequested > 0) {
    if (quotesReceived > 0 && waiting > 0) {
      return `${quotesReceived} quote${quotesReceived === 1 ? "" : "s"} received · waiting for ${waiting}`;
    }
    if (quotesReceived > 0) {
      return `${quotesReceived} quote${quotesReceived === 1 ? "" : "s"} received`;
    }
    return `Waiting for ${waiting} business${waiting === 1 ? "" : "es"}`;
  }
  // Every earlier stage (understand/discover/check) and every terminal state
  // already has a specific, accurate sentence — reuse it rather than
  // inventing a second copy of the same logic.
  return run.headline;
}

function requestLabel(run: AgentRun): string {
  if (run.understanding?.summary) return run.understanding.summary;
  const text = run.request.trim();
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

export function AgentWorkspaceHeader({ run }: { run: AgentRun | null }) {
  if (!run) {
    return (
      <h1 className="text-xl font-normal tracking-tight text-foreground sm:text-2xl">
        What are you trying to get done?
      </h1>
    );
  }

  // A real `tasks` row exists the moment the agent has requested a quote —
  // well before any recommendation. That is the accurate moment to say the
  // request itself outlives this conversation.
  const requestIsSaved = run.requestedQuotes.length > 0;

  return (
    <div>
      <h1 className="sr-only">Your workspace</h1>
      <Disclosure
        defaultOpen={false}
        summary={
          <span className="flex min-w-0 items-center gap-2">
            {run.status === "RUNNING" ? (
              <Loader2
                aria-hidden
                className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
              />
            ) : null}
            <span className="min-w-0 truncate text-sm">
              <span className="font-medium text-foreground">{requestLabel(run)}</span>
              <span className="text-muted"> · {progressPhrase(run)}</span>
            </span>
          </span>
        }
      >
        <StageList stages={run.stages} />
        {requestIsSaved ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-subtle">
            This request is saved — find it under Requests.
          </p>
        ) : null}
      </Disclosure>
    </div>
  );
}
