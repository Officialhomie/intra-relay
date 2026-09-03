"use client";

import { useState } from "react";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle } from "@/components/ui/Section";
import { ApiError, apiRequest } from "@/lib/api";
import { formatMoney, relativeTime } from "@/lib/format";
import { getSessionId } from "@/lib/session";

/**
 * The business wants a different price for a job you already agreed.
 *
 * This is a consequential commercial decision, so it gets the same treatment as
 * the original approval: both amounts on the surface, the difference stated in
 * money, the business's own reason, and two explicit choices. Nothing changes
 * until the buyer picks one (milestone 5 §6, §13).
 */

export interface PriceChangeDto {
  proposedAmount: string;
  agreedAmount: string;
  currency: string;
  direction: "higher" | "lower" | "same";
  difference: string;
  turnaround: string;
  reason: string;
  proposedAt: string;
  agreedExpired: boolean;
}

export function PriceChangePanel({
  taskId,
  change,
  businessName,
  onDecided,
}: {
  taskId: string;
  change: PriceChangeDto;
  businessName: string;
  onDecided: () => void;
}) {
  const [pending, setPending] = useState<null | "ACCEPT" | "DECLINE">(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "ACCEPT" | "DECLINE") {
    setPending(decision);
    setError(null);
    try {
      await apiRequest(`/api/tasks/${taskId}/price-change`, {
        method: "POST",
        sessionId: getSessionId(),
        body: { decision },
      });
      onDecided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record your choice. Try again.");
      setPending(null);
    }
  }

  const higher = change.direction === "higher";

  return (
    <Card as="section" className="border-warning/40 bg-warning-wash/40 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle aria-hidden className="size-5 shrink-0 text-warning" />
        <CardTitle>{businessName} wants to change the price</CardTitle>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        You agreed {formatMoney(change.agreedAmount, change.currency)}. They are asking for{" "}
        {formatMoney(change.proposedAmount, change.currency)} —{" "}
        {change.direction === "same" ? (
          "the same amount, with different terms"
        ) : (
          <>
            {formatMoney(change.difference, change.currency)} {higher ? "more" : "less"}
          </>
        )}
        .
      </p>

      <dl className="divide-y divide-border rounded-md border border-border bg-bg">
        <Row label="You agreed">{formatMoney(change.agreedAmount, change.currency)}</Row>
        <Row label="They are asking">
          <span className="font-medium">{formatMoney(change.proposedAmount, change.currency)}</span>
        </Row>
        <Row label="New turnaround">{change.turnaround}</Row>
        <Row label="Their reason">{change.reason}</Row>
        <Row label="Asked">{relativeTime(change.proposedAt)}</Row>
      </dl>

      <Callout tone="unavailable">
        Until you choose, the price you originally agreed still stands. Nothing has changed and no
        money has moved.
      </Callout>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button pending={pending === "ACCEPT"} onClick={() => decide("ACCEPT")}>
          Accept {formatMoney(change.proposedAmount, change.currency)}
        </Button>
        <Button
          variant="secondary"
          pending={pending === "DECLINE"}
          onClick={() => decide("DECLINE")}
        >
          Keep the price I agreed
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
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
