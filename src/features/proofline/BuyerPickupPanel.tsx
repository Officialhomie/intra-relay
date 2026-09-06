"use client";

import { useState } from "react";

import { CheckCircle2, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle } from "@/components/ui/Section";
import { TextField } from "@/components/ui/TextField";
import { ApiError, apiRequest } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { getSessionId } from "@/lib/session";

import { PROOFLINE_EVENT_LABEL, PROOFLINE_METHOD_LABEL } from "./labels";
import type { ProoflineView } from "./view";

/**
 * Buyer side of the Proofline pilot. Only rendered once the buyer has handed off
 * the order. Two optional events; this panel drives event 2 (confirm pickup).
 */
export function BuyerPickupPanel({
  taskId,
  proofline,
  onChanged,
}: {
  taskId: string;
  proofline: ProoflineView;
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [pending, setPending] = useState<null | "session" | "code">(null);
  const [error, setError] = useState<string | null>(null);

  const ready = proofline.evidenceStatus === "MERCHANT_MARKED_READY";
  const confirmed = proofline.evidenceStatus === "BUYER_CONFIRMED_PICKUP";

  async function confirm(mode: "session" | "code") {
    setPending(mode);
    setError(null);
    try {
      await apiRequest(`/api/tasks/${taskId}/proofline/confirm-pickup`, {
        method: "POST",
        sessionId: getSessionId(),
        body: mode === "code" ? { code: code.trim() } : {},
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record that. Please try again.");
      setPending(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <PackageCheck aria-hidden className="size-5 text-primary" />
        <CardTitle>Fulfilment evidence (Proofline pilot)</CardTitle>
      </div>

      {!ready && !confirmed ? (
        <p className="text-sm text-muted">
          Optional. When your order is ready, the printer marks it here. You then confirm you
          collected it — that is all this records.
        </p>
      ) : null}

      {ready ? (
        <>
          <p className="text-sm text-foreground">
            The printer marked this order <strong>ready for pickup</strong> on{" "}
            {formatDateTime(proofline.readyForPickupAt)}. This is the printer&apos;s statement, not
            a check by Intra.
          </p>
          <div className="space-y-3">
            <Button pending={pending === "session"} onClick={() => confirm("session")}>
              Confirm I&apos;ve collected this order
            </Button>
            {showCode ? (
              <div className="space-y-2">
                <TextField
                  label="Pickup code from the printer"
                  hint="Use this if you are collecting from a different phone."
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoCapitalize="characters"
                  inputMode="text"
                />
                <Button
                  variant="secondary"
                  pending={pending === "code"}
                  onClick={() => confirm("code")}
                >
                  Confirm with code
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCode(true)}
                className="text-sm font-medium text-primary underline"
              >
                Have a pickup code instead?
              </button>
            )}
          </div>
        </>
      ) : null}

      {confirmed ? (
        <Callout tone="success" title="You confirmed pickup">
          Recorded on {formatDateTime(proofline.pickupConfirmedAt)} —{" "}
          {proofline.pickupConfirmedBy
            ? PROOFLINE_METHOD_LABEL[proofline.pickupConfirmedBy]
            : "buyer"}
          .
        </Callout>
      ) : null}

      {proofline.events.length > 0 ? (
        <ol className="space-y-2 border-t border-border pt-3 text-sm">
          {proofline.events.map((event, i) => (
            <li key={i} className="flex gap-2">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              <span>
                {PROOFLINE_EVENT_LABEL[event.type]} · {formatDateTime(event.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <Callout tone="unavailable">{proofline.disclaimer}</Callout>
    </Card>
  );
}
