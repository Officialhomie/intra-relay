import type { Hex } from "viem";

import type { Database } from "@/lib/db/client";
import type { HandoverAttestationRow } from "@/lib/db/schema";
import { appendAuditEvent } from "@/features/audit/repository";
import { HttpError } from "@/lib/http/response";
import { manageTokenMatchesTask } from "@/features/businesses/access";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { commitmentIsExpired } from "@/features/commitments/status";

import { handoverCodeMatches } from "./handover";
import {
  findHandoverAttestationByTaskId,
  insertOrGetHandoverAttestation,
  updateHandoverAttestation,
} from "./handover-repository";
import { CELO_MAINNET_CHAIN_ID, EAS_CONTRACTS } from "./chain";
import {
  buildDelegatedAttestTypedData,
  encodeHandoverData,
  jobRef as computeJobRef,
  verifyDelegatedAttestSignature,
  ZERO_BYTES32,
  HANDOVER_SCHEMA_UID,
  type DelegatedAttestMessage,
} from "./schema";
import { HANDOVER_SIGN_WINDOW_MS } from "./handover-status";
import { AttestationUnavailableError, getEasWriter, type EasWriter } from "./writer";

/**
 * Two-party handover attestation (ADR-018, milestone 9).
 *
 * Mirrors `commitments/service.ts`'s attest/idempotent-retry shape, but the
 * cryptographic actor is different on purpose: `attestCommitment` signs with
 * Intra's own key; everything here signs with the MERCHANT's, relayed via
 * EAS's native `attestByDelegation` (`writer.ts`). Intra never holds a
 * signature it did not itself verify, and never claims a merchant signed
 * something the server actually signed (CLAUDE.md §4.1, M9 §2).
 */

export interface SigningRequest {
  status: "PENDING_SIGNATURE";
  typedData: ReturnType<typeof buildDelegatedAttestTypedData>;
  deadline: string;
}

function toSeconds(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000));
}

/** Rebuilds the exact EIP-712 message a PENDING_SIGNATURE row expects to be signed. */
function messageFromRow(row: HandoverAttestationRow): DelegatedAttestMessage {
  if (!row.revealedCode || !row.revealedSalt || !row.signNonce || !row.signDeadline) {
    throw new Error(
      `Handover attestation ${row.id} is missing fields for a PENDING_SIGNATURE row.`,
    );
  }
  const data = encodeHandoverData({
    jobRef: computeJobRef(row.taskId),
    providerAgentId: 0n,
    buyer: row.buyerAddress as Hex,
    fulfilledAt: toSeconds(row.fulfilledAt ?? row.createdAt),
    outcome: (row.outcome ?? "COMPLETED") as "COMPLETED",
    handoverCode: row.revealedCode,
    handoverSalt: row.revealedSalt as Hex,
  });
  return {
    attester: row.providerAddress as Hex,
    schema: HANDOVER_SCHEMA_UID,
    recipient: row.providerAddress as Hex,
    expirationTime: 0n, // the fulfilment event already happened — no independent expiry
    revocable: true,
    refUID: (row.refUid as Hex | null) ?? ZERO_BYTES32,
    data,
    value: 0n,
    nonce: BigInt(row.signNonce),
    deadline: toSeconds(row.signDeadline),
  };
}

/**
 * The EIP-712 signature is always bound to the real Celo mainnet EAS contract
 * — that is the only place a handover attestation can ever be relayed. Mock
 * mode simulates the *relay*, never a different signing domain, so a mock run
 * exercises exactly the signature a real run would need.
 */
const EAS_ADDRESS = EAS_CONTRACTS.eas as Hex;

function toSigningRequest(row: HandoverAttestationRow): SigningRequest {
  return {
    status: "PENDING_SIGNATURE",
    typedData: buildDelegatedAttestTypedData(
      messageFromRow(row),
      CELO_MAINNET_CHAIN_ID,
      EAS_ADDRESS,
    ),
    deadline: row.signDeadline!.toISOString(),
  };
}

export interface RequestSignatureInput {
  manageToken: string | null;
  presentedCode: string;
}

/**
 * Step 1 (merchant presents the buyer's code). A fresh presentation checks
 * the code; a retry of an already-verified request (wallet rejected, deadline
 * passed) never re-asks for it — the code was already correctly said aloud
 * once, and re-checking it would let a merchant probe repeatedly for a
 * guess. Only `salt` ever moves past this point, and only into the typed
 * data the merchant signs — never into a response field by itself.
 */
export async function requestHandoverSignature(
  db: Database,
  taskId: string,
  input: RequestSignatureInput,
  writer: EasWriter = getEasWriter(),
  now: Date = new Date(),
): Promise<SigningRequest> {
  if (!(await manageTokenMatchesTask(db, taskId, input.manageToken))) {
    throw new HttpError(
      401,
      "HANDOVER_AUTH_REQUIRED",
      "Presenting a handover code needs the business's manage token.",
    );
  }

  const commitment = await findCommitmentByTaskId(db, taskId);
  if (!commitment) {
    throw new HttpError(
      409,
      "NO_COMMITMENT",
      "This order has no commitment to attest a handover against.",
    );
  }

  if (commitment.status !== "ATTESTED") {
    throw new HttpError(
      409,
      "COMMITMENT_NOT_ATTESTED",
      "The order's commitment must be attested before a handover can be recorded.",
    );
  }
  if (commitmentIsExpired(commitment.validUntil, now)) {
    throw new HttpError(
      409,
      "COMMITMENT_EXPIRED",
      "This order's commitment window has expired, so a handover can no longer be attested against it.",
    );
  }

  const existing = await findHandoverAttestationByTaskId(db, commitment.taskId);

  if (existing?.status === "ATTESTED") {
    throw new HttpError(
      409,
      "HANDOVER_ALREADY_ATTESTED",
      "This order's handover is already recorded.",
    );
  }

  // A still-valid pending request is returned unchanged — no code re-check,
  // no new nonce. This is what makes the endpoint safe to call again on a
  // page reload.
  if (
    existing?.status === "PENDING_SIGNATURE" &&
    existing.signDeadline &&
    existing.signDeadline.getTime() > now.getTime()
  ) {
    return toSigningRequest(existing);
  }

  const isFreshPresentation = !existing;
  if (isFreshPresentation) {
    if (!handoverCodeMatches(input.presentedCode, commitment.handoverCode)) {
      throw new HttpError(
        401,
        "HANDOVER_CODE_MISMATCH",
        "That code doesn't match. Ask the customer to read it to you again.",
      );
    }
  }

  const nonce = await writer.readDelegationNonce(commitment.providerAddress as Hex);
  const deadline = new Date(now.getTime() + HANDOVER_SIGN_WINDOW_MS);
  const fulfilledAt = existing?.fulfilledAt ?? now;

  const { row, created } = await insertOrGetHandoverAttestation(db, {
    taskId: commitment.taskId,
    commitmentId: commitment.id,
    providerAddress: commitment.providerAddress,
    buyerAddress: commitment.buyerAddress,
    outcome: "COMPLETED",
    fulfilledAt,
    revealedCode: commitment.handoverCode,
    revealedSalt: commitment.handoverSalt,
    signNonce: nonce.toString(),
    signDeadline: deadline,
    refUid: commitment.attestationUid,
    status: "PENDING_SIGNATURE",
  });

  const persisted = created
    ? row
    : await updateHandoverAttestation(db, row.id, {
        outcome: "COMPLETED",
        fulfilledAt,
        revealedCode: commitment.handoverCode,
        revealedSalt: commitment.handoverSalt,
        signNonce: nonce.toString(),
        signDeadline: deadline,
        refUid: commitment.attestationUid,
        status: "PENDING_SIGNATURE",
        attestationError: null,
      });

  if (isFreshPresentation) {
    // The public commit only — never the code or salt (NFR-SEC-001).
    await appendAuditEvent(db, {
      type: "handover.code_verified",
      taskId: commitment.taskId,
      businessId: commitment.businessId,
      data: { handoverCommit: commitment.handoverCommit },
    });
  }

  return toSigningRequest(persisted);
}

export interface SubmitSignatureInput {
  manageToken: string | null;
  signature: Hex;
}

export interface SubmitSignatureResult {
  row: HandoverAttestationRow;
  wrote: boolean;
  mode: "mock" | "onchain" | null;
}

/**
 * Step 2 (merchant's wallet returns a signature). Recomputes the message from
 * STORED row state — never from anything the client resubmits — then
 * verifies the signature genuinely recovers to the merchant's own address
 * before relaying anything. A wrong signer, an altered field, or a
 * stale/reused nonce all fail here before reaching the chain (M9 §19); the
 * EAS contract enforces the same nonce/deadline bound independently on-chain.
 */
export async function submitHandoverSignature(
  db: Database,
  taskId: string,
  input: SubmitSignatureInput,
  writer: EasWriter = getEasWriter(),
  now: Date = new Date(),
): Promise<SubmitSignatureResult> {
  if (!(await manageTokenMatchesTask(db, taskId, input.manageToken))) {
    throw new HttpError(
      401,
      "HANDOVER_AUTH_REQUIRED",
      "Submitting a handover signature needs the business's manage token.",
    );
  }

  const row = await findHandoverAttestationByTaskId(db, taskId);
  if (!row) {
    throw new HttpError(
      404,
      "NO_HANDOVER_REQUEST",
      "No pending handover signing request for this order.",
    );
  }
  if (row.status === "ATTESTED") {
    return { row, wrote: false, mode: (row.attestationMode as "mock" | "onchain" | null) ?? null };
  }
  if (row.status !== "PENDING_SIGNATURE") {
    throw new HttpError(
      409,
      "HANDOVER_NOT_PENDING_SIGNATURE",
      "This order has no active signing request. Present the code again to start one.",
    );
  }
  if (!row.signDeadline || row.signDeadline.getTime() <= now.getTime()) {
    throw new HttpError(
      409,
      "HANDOVER_SIGNATURE_EXPIRED",
      "This signing request expired. Present the code again to get a fresh one.",
    );
  }

  const message = messageFromRow(row);

  const validSignature = await verifyDelegatedAttestSignature(
    message,
    input.signature,
    CELO_MAINNET_CHAIN_ID,
    EAS_ADDRESS,
  );
  if (!validSignature) {
    await updateHandoverAttestation(db, row.id, {
      status: "ATTESTATION_FAILED",
      attestationError: "SIGNATURE_DOES_NOT_MATCH_PROVIDER",
      attemptCount: row.attemptCount + 1,
    });
    throw new HttpError(
      401,
      "SIGNATURE_DOES_NOT_MATCH_PROVIDER",
      "That signature doesn't match this business's on-file address.",
    );
  }

  const r = input.signature.slice(0, 66) as Hex;
  const s = `0x${input.signature.slice(66, 130)}` as Hex;
  const v = parseInt(input.signature.slice(130, 132), 16);

  try {
    const result = await writer.attestHandoverDelegated({ message, signature: { v, r, s } });

    const attested = await updateHandoverAttestation(db, row.id, {
      status: "ATTESTED",
      attestationUid: result.uid,
      attestationTxHash: result.txHash,
      attestationMode: result.mode,
      attestationError: null,
      attestedAt: now,
      attemptCount: row.attemptCount + 1,
    });
    await appendAuditEvent(db, {
      type: "handover.attested",
      taskId: row.taskId,
      data: {
        uid: result.uid,
        txHash: result.txHash,
        mode: result.mode,
        schemaUid: result.schemaUid,
        simulated: result.simulated === true,
      },
    });
    return { row: attested, wrote: true, mode: result.mode };
  } catch (error) {
    const code =
      error instanceof AttestationUnavailableError
        ? error.code
        : error instanceof Error
          ? "ATTEST_WRITE_FAILED"
          : "ATTEST_UNKNOWN";
    const message2 = error instanceof Error ? error.message : "Unknown attestation failure.";

    const failed = await updateHandoverAttestation(db, row.id, {
      status: "ATTESTATION_FAILED",
      attestationError: `${code}: ${message2}`.slice(0, 500),
      attemptCount: row.attemptCount + 1,
    });
    await appendAuditEvent(db, {
      type: "handover.attestation_failed",
      taskId: row.taskId,
      data: { code },
    });
    return { row: failed, wrote: false, mode: null };
  }
}

/** Public view. Never exposes the revealed code, salt, nonce, or deadline internals. */
export function toPublicHandoverAttestation(row: HandoverAttestationRow) {
  return {
    taskId: row.taskId,
    status: row.status,
    provider: row.providerAddress,
    outcome: row.outcome,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    attestationUid: row.attestationUid,
    attestationTxHash: row.attestationTxHash,
    attestationMode: (row.attestationMode as "mock" | "onchain" | null) ?? null,
    simulated: row.attestationMode === "mock",
  };
}
