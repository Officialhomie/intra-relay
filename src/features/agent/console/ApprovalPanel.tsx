"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Section";
import { formatDateTime } from "@/lib/format";

import type { AgentRun } from "./types";

/**
 * The approval boundary. This is the one place in the console where nothing is
 * abstracted away.
 *
 * Money, the business being committed to, the terms, and the expiry are all
 * stated on the surface — never behind a disclosure — and the action button
 * names its own consequence rather than saying "Continue" (Part 9 / Part 13).
 *
 * The decision is bound to `offerFingerprint`: if the quote moved after it was
 * shown, the server refuses this approval and the buyer is asked again.
 */
export function ApprovalPanel({
  run,
  pending,
  onDecide,
}: {
  run: AgentRun;
  pending: "ACCEPT" | "DECLINE" | null;
  onDecide: (decision: "ACCEPT" | "DECLINE", reason?: string) => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const rec = run.recommendation;
  if (!rec) return null;

  const service = run.understanding?.summary ?? "the job you described";

  return (
    <Card as="section" className="border-primary/40 bg-primary-wash/40 space-y-4">
      <CardTitle>Before we go ahead</CardTitle>

      <dl className="divide-y divide-border rounded-md border border-border bg-bg">
        <Row label="Business">{rec.businessName}</Row>
        <Row label="Service">{service}</Row>
        <Row label="Total price">
          <span className="text-base font-medium">{rec.price}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {rec.priceBasis === "fixed price"
              ? "Fixed — the printer committed to this amount"
              : "An estimate — the final amount can still move"}
          </span>
        </Row>
        <Row label="Expected completion">Within {rec.turnaround}</Row>
        <Row label="Price held until">
          {rec.expiresAt ? formatDateTime(rec.expiresAt) : "no expiry given"}
        </Row>
        <Row label="Who you pay">
          {rec.businessName}, directly
          <span className="mt-0.5 block text-xs text-muted">
            Intra never holds, sends or takes this money.
          </span>
        </Row>
      </dl>

      <p className="text-sm leading-relaxed text-muted">{rec.finalOrderStatement}</p>

      {declining ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="decline-reason" className="block text-sm font-medium">
              Why not? <span className="font-normal text-subtle">(optional)</span>
            </label>
            <textarea
              id="decline-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Too expensive, too slow, found another printer…"
              className="w-full rounded-md border border-border bg-bg px-3 py-2.5 text-base outline-none focus-visible:border-foreground"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="danger"
              pending={pending === "DECLINE"}
              onClick={() => onDecide("DECLINE", reason.trim() || undefined)}
            >
              Decline — don&apos;t proceed
            </Button>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button pending={pending === "ACCEPT"} onClick={() => onDecide("ACCEPT")}>
            Approve {rec.price} with {rec.businessName}
          </Button>
          <Button variant="secondary" onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words text-sm text-foreground sm:max-w-[60%] sm:text-right">
        {children}
      </dd>
    </div>
  );
}
