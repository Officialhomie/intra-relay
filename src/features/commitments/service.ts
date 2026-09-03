import type { Database } from "@/lib/db/client";
import type { BusinessRow, CommitmentRow, QuoteRow, TaskRow } from "@/lib/db/schema";
import { appendAuditEvent } from "@/features/audit/repository";
import { issueHandoverSecret } from "@/features/attestation/handover";
import { jobRef, type CommitmentAttestationData } from "@/features/attestation/schema";
import {
  AttestationUnavailableError,
  getEasWriter,
  type EasWriter,
} from "@/features/attestation/writer";

import { findCommitmentByTaskId, insertOrGetCommitment, updateCommitment } from "./repository";
import {
  assetAddressForCurrency,
  commitmentIsExpired,
  OFF_CHAIN_ASSET,
  resolveValidUntil,
  toMinorUnits,
} from "./status";

/**
 * Commitment orchestration.
 *
 *   quote  ->  human approval  ->  commitment created  ->  commitment attested
 *
 * Creation is local and transactional with the approval, so an approved
 * purchase decision can never be lost to a network failure. Attestation is a
 * separate, retryable, idempotent step because it is an external side effect.
 *
 * The agent layer decides; this layer orchestrates; the attestation layer talks
 * to the chain. None of them are merged.
 */

export interface CreateCommitmentInput {
  task: TaskRow;
  quote: QuoteRow;
  business: BusinessRow;
  approvedAt: Date;
  /** Buyer wallet when one is bound. Zero address otherwise — never a session id. */
  buyerAddress?: string;
}

/**
 * Called at the moment of human approval. Issues the handover secret and
 * records the commitment as PENDING_ATTESTATION. Idempotent on `task.id`.
 */
export async function createCommitmentForApproval(
  db: Database,
  input: CreateCommitmentInput,
): Promise<{ commitment: CommitmentRow; created: boolean }> {
  const { task, quote, business, approvedAt } = input;

  const total = Number(quote.amountMin) + Number(quote.deliveryCharge ?? 0);
  const { validUntil, source } = resolveValidUntil(quote.expiresAt, approvedAt);
  const asset = assetAddressForCurrency(quote.currency);

  // The buyer holds `code`; the server withholds `salt` until a correct code is
  // presented. Only `commit` is ever public (ADR-018).
  const secret = issueHandoverSecret();

  const { row, created } = await insertOrGetCommitment(db, {
    taskId: task.id,
    quoteId: quote.id,
    businessId: business.id,
    jobRef: jobRef(task.id),
    providerAddress: business.payoutAddress,
    providerAgentId: "0",
    buyerAddress: input.buyerAddress ?? OFF_CHAIN_ASSET,
    amountMinor: toMinorUnits(total).toString(),
    currency: quote.currency,
    assetAddress: asset.address,
    quotedAt: task.quotedAt ?? quote.createdAt,
    validUntil,
    expirySource: source,
    handoverCommit: secret.commit,
    handoverSalt: secret.salt,
    handoverCode: secret.code,
    status: "PENDING_ATTESTATION",
  });

  if (created) {
    // No secret material in the audit trail — only the public commit.
    await appendAuditEvent(db, {
      type: "commitment.created",
      taskId: task.id,
      businessId: business.id,
      routeId: task.routeId,
      quoteId: quote.id,
      data: {
        jobRef: row.jobRef,
        handoverCommit: row.handoverCommit,
        validUntil: validUntil.toISOString(),
        expirySource: source,
        currency: quote.currency,
        assetOnChain: asset.onChain,
      },
    });
  }

  return { commitment: row, created };
}

/** The Schema A payload for a stored commitment. Encoding stays in `schema.ts`. */
export function toAttestationData(row: CommitmentRow): CommitmentAttestationData {
  return {
    jobRef: row.jobRef as `0x${string}`,
    providerAgentId: BigInt(row.providerAgentId),
    buyer: row.buyerAddress as `0x${string}`,
    amount: BigInt(row.amountMinor),
    asset: row.assetAddress as `0x${string}`,
    quotedAt: BigInt(Math.floor(row.quotedAt.getTime() / 1000)),
    validUntil: BigInt(Math.floor(row.validUntil.getTime() / 1000)),
    handoverCommit: row.handoverCommit as `0x${string}`,
  };
}

export interface AttestResult {
  commitment: CommitmentRow;
  /** False when an already-ATTESTED row was returned unchanged. */
  wrote: boolean;
  mode: "mock" | "onchain" | null;
}

/**
 * Writes the commitment attestation. Safe to call repeatedly:
 *
 *   ATTESTED            -> returns the stored UID, writes nothing
 *   PENDING/FAILED      -> attempts a write
 *   expired commitment  -> refuses, rather than attesting a stale promise
 *
 * A writer failure leaves the row ATTESTATION_FAILED with the reason, so the
 * approval survives and the write can be retried.
 */
export async function attestCommitment(
  db: Database,
  taskId: string,
  writer: EasWriter = getEasWriter(),
  now: Date = new Date(),
): Promise<AttestResult> {
  const row = await findCommitmentByTaskId(db, taskId);
  if (!row) throw new Error(`No commitment for task ${taskId}.`);

  // Idempotent: never write the same commitment twice.
  if (row.status === "ATTESTED" && row.attestationUid) {
    return {
      commitment: row,
      wrote: false,
      mode: (row.attestationMode as "mock" | "onchain" | null) ?? null,
    };
  }

  if (commitmentIsExpired(row.validUntil, now)) {
    const failed = await updateCommitment(db, row.id, {
      status: "ATTESTATION_FAILED",
      attestationError: "COMMITMENT_EXPIRED",
      attemptCount: row.attemptCount + 1,
    });
    await appendAuditEvent(db, {
      type: "commitment.attestation_failed",
      taskId,
      quoteId: row.quoteId,
      data: { reason: "COMMITMENT_EXPIRED", validUntil: row.validUntil.toISOString() },
    });
    return { commitment: failed, wrote: false, mode: null };
  }

  try {
    const result = await writer.attestCommitment({
      data: toAttestationData(row),
      recipient: row.providerAddress as `0x${string}`,
      expirationTime: BigInt(Math.floor(row.validUntil.getTime() / 1000)),
    });

    const attested = await updateCommitment(db, row.id, {
      status: "ATTESTED",
      attestationUid: result.uid,
      attestationTxHash: result.txHash,
      attestationMode: result.mode,
      attestationError: null,
      attestedAt: now,
      attemptCount: row.attemptCount + 1,
    });
    await appendAuditEvent(db, {
      type: "commitment.attested",
      taskId,
      businessId: row.businessId,
      quoteId: row.quoteId,
      data: {
        uid: result.uid,
        txHash: result.txHash,
        mode: result.mode,
        schemaUid: result.schemaUid,
        simulated: result.simulated === true,
      },
    });
    return { commitment: attested, wrote: true, mode: result.mode };
  } catch (error) {
    const code =
      error instanceof AttestationUnavailableError
        ? error.code
        : error instanceof Error
          ? "ATTEST_WRITE_FAILED"
          : "ATTEST_UNKNOWN";
    const message = error instanceof Error ? error.message : "Unknown attestation failure.";

    const failed = await updateCommitment(db, row.id, {
      status: "ATTESTATION_FAILED",
      attestationError: `${code}: ${message}`.slice(0, 500),
      attemptCount: row.attemptCount + 1,
    });
    await appendAuditEvent(db, {
      type: "commitment.attestation_failed",
      taskId,
      quoteId: row.quoteId,
      data: { code },
    });
    return { commitment: failed, wrote: false, mode: null };
  }
}

/** Public view. Never exposes the salt or the buyer's handover code. */
export function toPublicCommitment(row: CommitmentRow) {
  return {
    taskId: row.taskId,
    jobRef: row.jobRef,
    status: row.status,
    provider: row.providerAddress,
    amountMinor: row.amountMinor,
    currency: row.currency,
    assetAddress: row.assetAddress,
    quotedAt: row.quotedAt.toISOString(),
    validUntil: row.validUntil.toISOString(),
    expirySource: row.expirySource,
    handoverCommit: row.handoverCommit,
    attestationUid: row.attestationUid,
    attestationTxHash: row.attestationTxHash,
    attestationMode: row.attestationMode,
    simulated: row.attestationMode === "mock",
  };
}
