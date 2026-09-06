import { z } from "zod";

/**
 * Proofline pilot — Relay's fulfilment-evidence layer (PRODUCT_VISION §3.2,
 * ADR-012, ADR-016).
 *
 * Deliberately tiny: two optional events after a buyer has personally handed off
 * an order. It is **not** escrow, dispute resolution, a payment settlement, a
 * cryptographic proof, or a reliability score.
 */

// The only two events in the pilot.
export const PROOFLINE_EVENT_TYPES = ["READY_FOR_PICKUP", "PICKUP_CONFIRMED"] as const;
export const prooflineEventTypeSchema = z.enum(PROOFLINE_EVENT_TYPES);
export type ProoflineEventType = z.infer<typeof prooflineEventTypeSchema>;

// Who recorded the event. The "required actor" for each event type:
//   READY_FOR_PICKUP  → merchant
//   PICKUP_CONFIRMED  → buyer
export const PROOFLINE_ACTOR_ROLES = ["merchant", "buyer"] as const;
export const prooflineActorRoleSchema = z.enum(PROOFLINE_ACTOR_ROLES);
export type ProoflineActorRole = z.infer<typeof prooflineActorRoleSchema>;

// How the actor authenticated the statement.
export const PROOFLINE_CONFIRMATION_METHODS = [
  "merchant_manage_token", // merchant presented their route manage token
  "buyer_session", // buyer confirmed from their own task session ("signed-in")
  "one_time_code", // buyer entered the pickup code the merchant handed them
] as const;
export const prooflineConfirmationMethodSchema = z.enum(PROOFLINE_CONFIRMATION_METHODS);
export type ProoflineConfirmationMethod = z.infer<typeof prooflineConfirmationMethodSchema>;

// The order's fulfilment-evidence status *after* an event. Stored on every row
// so the append-only log is self-describing.
export const PROOFLINE_EVIDENCE_STATUSES = [
  "NOT_STARTED", // no Proofline event yet
  "MERCHANT_MARKED_READY", // merchant reported the job ready for pickup
  "BUYER_CONFIRMED_PICKUP", // buyer confirmed they collected it
] as const;
export const prooflineEvidenceStatusSchema = z.enum(PROOFLINE_EVIDENCE_STATUSES);
export type ProoflineEvidenceStatus = z.infer<typeof prooflineEvidenceStatusSchema>;

/**
 * Shown verbatim in the API responses and the UI for both actors. Proofline
 * records must never be presented as proof or settlement.
 */
export const PROOFLINE_DISCLAIMER =
  "Operational evidence only. Each entry is a timestamped statement by the person named — " +
  "not a cryptographic proof, not a payment receipt or settlement, and not a guarantee that " +
  "the work met any standard. Nothing here moves money or places an order.";
