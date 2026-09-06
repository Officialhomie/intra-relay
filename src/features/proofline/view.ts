import type { ProoflineEventRow } from "@/lib/db/schema";

import {
  PROOFLINE_DISCLAIMER,
  type ProoflineActorRole,
  type ProoflineConfirmationMethod,
  type ProoflineEventType,
  type ProoflineEvidenceStatus,
} from "./status";

export interface ProoflineEventView {
  type: ProoflineEventType;
  actorRole: ProoflineActorRole;
  confirmationMethod: ProoflineConfirmationMethod;
  evidenceStatus: ProoflineEvidenceStatus;
  at: string;
}

export interface ProoflineView {
  /** Shown verbatim to both actors — this is evidence, not proof or settlement. */
  disclaimer: string;
  evidenceStatus: ProoflineEvidenceStatus;
  readyForPickupAt: string | null;
  pickupConfirmedAt: string | null;
  pickupConfirmedBy: ProoflineConfirmationMethod | null;
  /** Merchant-only: the code to read to the buyer. Absent from the buyer's view. */
  pickupCode?: string;
  events: ProoflineEventView[];
}

/** Pure — build the buyer/merchant view from the append-only event log. */
export function buildProoflineView(
  events: ProoflineEventRow[],
  options: { includePickupCode: boolean },
): ProoflineView {
  const ready = events.find((event) => event.eventType === "READY_FOR_PICKUP") ?? null;
  const confirmed = events.find((event) => event.eventType === "PICKUP_CONFIRMED") ?? null;
  const current: ProoflineEvidenceStatus =
    events.length > 0 ? events[events.length - 1].evidenceStatus : "NOT_STARTED";

  return {
    disclaimer: PROOFLINE_DISCLAIMER,
    evidenceStatus: current,
    readyForPickupAt: ready?.createdAt.toISOString() ?? null,
    pickupConfirmedAt: confirmed?.createdAt.toISOString() ?? null,
    pickupConfirmedBy: confirmed?.confirmationMethod ?? null,
    ...(options.includePickupCode && ready?.pickupCode && !confirmed
      ? { pickupCode: ready.pickupCode }
      : {}),
    events: events.map((event) => ({
      type: event.eventType,
      actorRole: event.actorRole,
      confirmationMethod: event.confirmationMethod,
      evidenceStatus: event.evidenceStatus,
      at: event.createdAt.toISOString(),
    })),
  };
}
