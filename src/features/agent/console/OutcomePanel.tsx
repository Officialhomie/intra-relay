"use client";

import Link from "next/link";

import { ArrowRight, CheckCircle2, CircleSlash } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle } from "@/components/ui/Section";

import type { AgentRun } from "./types";

/**
 * What happened, and what happens next.
 *
 * After an approval the buyer's job is not finished — they still send the
 * message and pay the printer. Saying so, with the next action in reach, is the
 * difference between a run that ended and a workflow that completed.
 */
export function OutcomePanel({ run, onRestart }: { run: AgentRun; onRestart: () => void }) {
  if (run.decision?.outcome === "APPROVED") return <Approved run={run} />;
  if (run.decision?.outcome === "DECLINED") return <Declined onRestart={onRestart} />;
  if (run.outcome) return <Unsuccessful run={run} onRestart={onRestart} />;
  return null;
}

function Approved({ run }: { run: AgentRun }) {
  const name = run.recommendation?.businessName ?? "the printer";
  return (
    <Card as="section" className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
        <CardTitle>Agreed with {name}</CardTitle>
      </div>

      <ol className="space-y-2 text-sm">
        <Step done>Your decision is recorded</Step>
        <Step done={run.commitment != null}>
          The agreed price and terms are locked to this order
        </Step>
        <Step>You send the printer the message and agree the order</Step>
        <Step>You collect, and confirm the handover</Step>
      </ol>

      {run.taskId ? (
        <Link
          href={`/tasks/${run.taskId}`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-contrast transition-opacity hover:opacity-90 sm:w-auto"
        >
          Open your order and copy the message
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}

      <Callout tone="unavailable">
        Intra does not send that message and never pays the printer for you. You send it, and you
        pay them directly.
      </Callout>

      {run.commitment ? (
        <details className="rounded-md border border-border bg-bg px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Record details</summary>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Status</dt>
              <dd className="text-right text-foreground">
                {run.commitment.status}
                {run.commitment.simulated ? " (simulated — not on a public chain)" : ""}
              </dd>
            </div>
            {run.commitment.attestationUid ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted">Reference</dt>
                <dd className="break-all font-mono text-foreground">
                  {run.commitment.attestationUid}
                </dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}
    </Card>
  );
}

function Step({ children, done = false }: { children: React.ReactNode; done?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {done ? (
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <span
          aria-hidden
          className="mt-1.5 size-1.5 shrink-0 rounded-full border border-border-strong"
        />
      )}
      <span className={done ? "text-foreground" : "text-muted"}>
        {children}
        <span className="sr-only">{done ? " — done" : " — still to do"}</span>
      </span>
    </li>
  );
}

function Declined({ onRestart }: { onRestart: () => void }) {
  return (
    <Card as="section" className="space-y-3">
      <div className="flex items-center gap-2">
        <CircleSlash aria-hidden className="size-5 shrink-0 text-muted" />
        <CardTitle>You didn&apos;t go ahead</CardTitle>
      </div>
      <p className="text-sm text-muted">
        Nothing was ordered and no money moved. The printer was told you passed, which keeps their
        availability accurate.
      </p>
      <Button variant="secondary" onClick={onRestart}>
        Try a different request
      </Button>
    </Card>
  );
}

function Unsuccessful({ run, onRestart }: { run: AgentRun; onRestart: () => void }) {
  const outcome = run.outcome!;
  return (
    <Card as="section" className="space-y-3">
      <CardTitle>{outcome.title}</CardTitle>
      <p className="text-sm leading-relaxed text-muted">{outcome.body}</p>
      {outcome.recovery ? <p className="text-sm text-foreground">{outcome.recovery}</p> : null}
      <p className="text-xs text-subtle">Nothing was ordered and no money moved.</p>
      <Button variant="secondary" onClick={onRestart}>
        Try again
      </Button>
    </Card>
  );
}
