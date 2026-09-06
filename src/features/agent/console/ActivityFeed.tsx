"use client";

import { cn } from "@/lib/utils";

import type { ActivityItem, AgentRun, TraceEntry } from "./types";

/**
 * Who did what.
 *
 * The point of showing this is not decoration — it is that the buyer can see
 * the division of labour honestly: they decide, the agent coordinates, printers
 * answer as people, and Intra records. Nothing here names a tool or an endpoint.
 *
 * The raw trace lives underneath, behind its own disclosure, for engineering.
 */

const ACTOR_LABEL: Record<ActivityItem["actor"], string> = {
  you: "You",
  agent: "Agent",
  printer: "Printer",
  system: "Intra",
};

const ACTOR_STYLE: Record<ActivityItem["actor"], string> = {
  you: "bg-primary-wash text-primary",
  agent: "bg-info-wash text-info",
  printer: "bg-surface-accent text-muted",
  system: "bg-success-wash text-success",
};

export function ActivityFeed({ run }: { run: AgentRun }) {
  if (run.activity.length === 0) return null;

  return (
    <details className="rounded-md border border-border bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">What happened, step by step</summary>

      <ol className="mt-4 space-y-3">
        {run.activity.map((item, i) => (
          <li key={`${item.at}-${i}`} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                ACTOR_STYLE[item.actor],
              )}
            >
              {ACTOR_LABEL[item.actor]}
            </span>
            <p
              className={cn(
                "text-sm leading-relaxed",
                item.tone === "blocked" ? "text-muted" : "text-foreground",
                item.tone === "recovery" && "text-warning",
              )}
            >
              {item.text}
            </p>
          </li>
        ))}
      </ol>

      {run.trace ? <EngineeringTrace run={run} entries={run.trace.entries} /> : null}
    </details>
  );
}

/**
 * The unmodified engineering trace: tool calls, model exchanges, timings, run
 * id. Deliberately the innermost layer of disclosure — detailed observability
 * without cluttering the primary experience (Part 19).
 */
function EngineeringTrace({ run, entries }: { run: AgentRun; entries: TraceEntry[] }) {
  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="cursor-pointer text-xs font-medium text-muted">
        Engineering trace ({entries.length} events)
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <dt className="text-muted">Run id</dt>
        <dd className="break-all font-mono text-foreground">{run.runId}</dd>
        <dt className="text-muted">Reasoning</dt>
        <dd className="text-foreground">
          {run.model.configured
            ? `${run.model.provider}/${run.model.model} · ${run.model.calls} call${run.model.calls === 1 ? "" : "s"}`
            : "deterministic rules only"}
        </dd>
        <dt className="text-muted">Quote tasks</dt>
        <dd className="break-all font-mono text-foreground">
          {run.requestedQuotes.map((q) => q.taskId).join(", ") || "—"}
        </dd>
      </dl>
      <ol className="mt-3 space-y-1">
        {entries.map((entry, i) => (
          <li key={i} className="font-mono text-[11px] leading-relaxed text-muted">
            <span className="text-subtle">{entry.at.slice(11, 19)}</span> {entry.kind}{" "}
            <span className="text-foreground">{entry.label}</span>
            {entry.durationMs != null ? ` ${entry.durationMs}ms` : ""}
            {entry.detail ? ` — ${entry.detail}` : ""}
          </li>
        ))}
      </ol>
    </details>
  );
}
