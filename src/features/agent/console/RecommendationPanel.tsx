"use client";

import { Clock3, Sparkles } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDateTime, relativeTime } from "@/lib/format";

import type { AgentRun } from "./types";

/**
 * The recommendation, as a person reads it: who, how much, how fast, and why —
 * in that order. No score, no weights, no formula.
 *
 * Everything technical about the quote is real and still available, moved into
 * the "Details" disclosure rather than deleted (Part 12).
 */
export function RecommendationPanel({ run }: { run: AgentRun }) {
  const rec = run.recommendation;
  if (!rec) return null;

  return (
    <Card as="section" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Recommended</p>
          <CardTitle className="mt-1 text-lg">{rec.businessName}</CardTitle>
        </div>
        <StatusPill tone={rec.priceBasis === "fixed price" ? "active" : "pending"}>
          {rec.priceBasis}
        </StatusPill>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-2xl font-medium tracking-tight text-foreground">{rec.price}</p>
        <p className="text-sm text-muted">Ready within {rec.turnaround}</p>
      </div>

      {rec.expiresAt ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Clock3 aria-hidden className="size-4 shrink-0" />
          This price holds until {formatDateTime(rec.expiresAt)} ({relativeTime(rec.expiresAt)})
        </p>
      ) : (
        <p className="text-sm text-muted">
          No expiry was given, so treat this as indicative rather than held.
        </p>
      )}

      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          Why this one?
          {rec.modelReasoned ? (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-subtle">
              <Sparkles aria-hidden className="size-3" />
              agent&apos;s reasoning
            </span>
          ) : null}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{rec.selectionReason}</p>
        {rec.tradeoffs.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {rec.tradeoffs.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {run.alternatives.length > 0 ? <Alternatives run={run} /> : null}
      {run.ruledOut.length > 0 ? <RuledOut run={run} /> : null}

      {rec.uncertainties.length > 0 ? (
        <Callout tone="unavailable" title="What I cannot confirm">
          <ul className="list-disc space-y-1 pl-4">
            {rec.uncertainties.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <details className="rounded-md border border-border bg-bg px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Details</summary>
        <dl className="mt-3 space-y-2">
          {rec.details.map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6"
            >
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd className="text-xs text-foreground sm:text-right">{formatIfDate(row.value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;
function formatIfDate(value: string): string {
  return ISO.test(value) ? formatDateTime(value) : value;
}

function Alternatives({ run }: { run: AgentRun }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">
        Other options I found ({run.alternatives.length})
      </h3>
      <ul className="mt-2 space-y-2">
        {run.alternatives.map((alt) => (
          <li
            key={alt.businessSlug}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-md border border-border bg-bg px-3 py-2.5"
          >
            <span className="text-sm text-foreground">{alt.businessName}</span>
            <span className="text-sm text-muted">
              {alt.price} · {alt.turnaround}
            </span>
            {alt.comparedToPick ? (
              <span className="w-full text-xs text-subtle">{alt.comparedToPick}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuledOut({ run }: { run: AgentRun }) {
  return (
    <details className="rounded-md border border-border bg-bg px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        I ruled out {run.ruledOut.length} {run.ruledOut.length === 1 ? "printer" : "printers"}
      </summary>
      <ul className="mt-3 space-y-2">
        {run.ruledOut.map((item, i) => (
          <li key={`${item.name}-${i}`} className="text-xs leading-relaxed text-muted">
            <span className="font-medium text-foreground">{item.name}</span> — {item.because}
          </li>
        ))}
      </ul>
    </details>
  );
}
