"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, apiRequest } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

import { PROOFLINE_EVENT_LABEL, PROOFLINE_METHOD_LABEL } from "./labels";
import type { ProoflineView } from "./view";

/**
 * Merchant side of the Proofline pilot. Drives event 1 (mark ready for pickup)
 * and shows the one-time code the merchant reads to the buyer at collection.
 */
export function MerchantFulfilmentPanel({
  taskId,
  manageToken,
  proofline,
}: {
  taskId: string;
  manageToken: string;
  proofline: ProoflineView;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notStarted = proofline.evidenceStatus === "NOT_STARTED";
  const ready = proofline.evidenceStatus === "MERCHANT_MARKED_READY";
  const confirmed = proofline.evidenceStatus === "BUYER_CONFIRMED_PICKUP";

  async function markReady() {
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/api/tasks/${taskId}/proofline/ready`, {
        method: "POST",
        manageToken,
        body: {},
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-bg p-4">
      <div className="flex items-center gap-2">
        <PackageCheck aria-hidden className="size-4 text-primary" />
        <p className="text-sm font-medium">Fulfilment evidence (Proofline pilot)</p>
      </div>

      {notStarted ? (
        <>
          <p className="text-sm text-muted">
            Optional. When this order is printed and ready, mark it here. You&apos;ll get a short
            code to read to the buyer; they confirm collection on their own phone.
          </p>
          <Button size="sm" pending={pending} onClick={markReady}>
            Mark ready for pickup
          </Button>
        </>
      ) : null}

      {ready ? (
        <>
          <p className="text-sm text-foreground">
            Marked ready on {formatDateTime(proofline.readyForPickupAt)}. Waiting for the buyer to
            confirm they collected it.
          </p>
          {proofline.pickupCode ? (
            <div className="rounded-md border border-border-strong bg-surface p-3 text-center">
              <p className="text-xs uppercase tracking-wide text-subtle">Pickup code</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em]">
                {proofline.pickupCode}
              </p>
              <p className="mt-1 text-xs text-muted">
                Read this to the buyer at collection. Or they can confirm from their own request
                link.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {confirmed ? (
        <Callout tone="success" title="Buyer confirmed pickup">
          Recorded on {formatDateTime(proofline.pickupConfirmedAt)} —{" "}
          {proofline.pickupConfirmedBy
            ? PROOFLINE_METHOD_LABEL[proofline.pickupConfirmedBy]
            : "buyer"}
          .
        </Callout>
      ) : null}

      {proofline.events.length > 0 ? (
        <ol className="space-y-1.5 border-t border-border pt-3 text-xs text-muted">
          {proofline.events.map((event, i) => (
            <li key={i} className="flex gap-2">
              <CheckCircle2 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
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
    </div>
  );
}
