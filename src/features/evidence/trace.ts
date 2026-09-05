import type { Database } from "@/lib/db/client";
import { findTaskById, listTaskQuotes, listTaskPayments } from "@/features/tasks/repository";
import { findRouteById } from "@/features/routes/repository";
import { findBusinessById } from "@/features/businesses/repository";
import { listTaskAuditEvents } from "@/features/audit/repository";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { findHandoverAttestationByTaskId } from "@/features/attestation/handover-repository";
import {
  CELOSCAN_ADDRESS_BASE,
  CELOSCAN_TX_BASE,
  easExplorerUrl,
} from "@/features/attestation/chain";
import { COMMITMENT_SCHEMA_UID, HANDOVER_SCHEMA_UID } from "@/features/attestation/schema";

/**
 * The single operator/judge-facing trace for one transaction (M9 §14, §16).
 *
 * This is the "prove what happened" surface — internal ids and raw on-chain
 * references are fine here because it is never shown to a buyer or a business
 * (M9 §27). It reconstructs the chain by `taskId`, the one durable key every
 * table shares, so an operator never has to hand-join anything.
 *
 * It states what the evidence is, not more than it is: an EAS attestation
 * records acknowledged protocol participation and an economic event, not
 * physical quality or quantity (M9 §18).
 */

function explorerTx(hash: string | null): string | null {
  return hash ? `${CELOSCAN_TX_BASE}${hash}` : null;
}
function explorerAddress(addr: string | null): string | null {
  return addr ? `${CELOSCAN_ADDRESS_BASE}${addr}` : null;
}

export interface TransactionTrace {
  task: {
    id: string;
    status: string;
    createdAt: string;
    quotedAt: string | null;
    handoffConfirmedAt: string | null;
    buyerDecision: string | null;
    buyerDecidedAt: string | null;
    /** Truncated — enough to correlate a conversation, not to impersonate one. */
    buyerSessionPrefix: string | null;
  };
  provider: {
    businessName: string;
    routeName: string | null;
    payoutAddress: string;
    payoutAddressExplorer: string | null;
    /** ERC-8004 agent id, or "0" while identity registration is deferred (M9 §9). */
    providerAgentId: string;
  } | null;
  quotes: {
    id: string;
    status: string;
    amountMin: string;
    amountMax: string | null;
    currency: string;
    createdAt: string;
  }[];
  commitment: {
    jobRef: string;
    status: string;
    buyerAddress: string;
    amountMinor: string;
    currency: string;
    assetAddress: string;
    handoverCommit: string;
    schemaUid: string;
    attestationUid: string | null;
    attestationUidExplorer: string | null;
    attestationTxHash: string | null;
    attestationTxExplorer: string | null;
    attestationMode: string | null;
    attestedAt: string | null;
  } | null;
  handover: {
    status: string;
    outcome: string | null;
    fulfilledAt: string | null;
    attesterAddress: string;
    refUid: string | null;
    schemaUid: string;
    attestationUid: string | null;
    attestationUidExplorer: string | null;
    attestationTxHash: string | null;
    attestationTxExplorer: string | null;
    attestationMode: string | null;
    attestedAt: string | null;
    /** True once a real merchant signature was verified and relayed, not simulated. */
    signedByProvider: boolean;
  } | null;
  payments: {
    provider: string | null;
    asset: string | null;
    amountAtomic: string | null;
    payee: string | null;
    status: string;
    txHash: string | null;
    txExplorer: string | null;
    createdAt: string;
  }[];
  timeline: { type: string; at: string }[];
  /** Cross-check summary: do the DB and the on-chain records describe one event? (M9 §13) */
  consistency: {
    commitmentAttested: boolean;
    handoverAttested: boolean;
    handoverReferencesCommitment: boolean | null;
    anySimulated: boolean;
  };
  disclaimer: string;
}

const DISCLAIMER =
  "This records acknowledged protocol participation and an economic event between the named " +
  "parties. It is not a check by Intra of the goods' quantity, quality, timeliness, or of the " +
  "buyer's satisfaction.";

export async function buildTransactionTrace(
  db: Database,
  taskId: string,
): Promise<TransactionTrace | null> {
  const task = await findTaskById(db, taskId);
  if (!task) return null;

  const route = task.routeId ? await findRouteById(db, task.routeId) : null;
  const business = route ? await findBusinessById(db, route.businessId) : null;
  const quotes = await listTaskQuotes(db, taskId);
  const payments = await listTaskPayments(db, taskId);
  const commitment = await findCommitmentByTaskId(db, taskId);
  const handover = await findHandoverAttestationByTaskId(db, taskId);
  const events = await listTaskAuditEvents(db, taskId);

  const buyerSession = task.buyerClaimSession ?? null;

  return {
    task: {
      id: task.id,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
      quotedAt: task.quotedAt?.toISOString() ?? null,
      handoffConfirmedAt: task.handoffConfirmedAt?.toISOString() ?? null,
      buyerDecision: task.buyerDecision ?? null,
      buyerDecidedAt: task.buyerDecidedAt?.toISOString() ?? null,
      buyerSessionPrefix: buyerSession ? `${buyerSession.slice(0, 8)}…` : null,
    },
    provider: business
      ? {
          businessName: business.name,
          routeName: route?.name ?? null,
          payoutAddress: business.payoutAddress,
          payoutAddressExplorer: explorerAddress(business.payoutAddress),
          providerAgentId: commitment?.providerAgentId ?? "0",
        }
      : null,
    quotes: quotes.map((q) => ({
      id: q.id,
      status: q.status,
      amountMin: q.amountMin,
      amountMax: q.amountMax,
      currency: q.currency,
      createdAt: q.createdAt.toISOString(),
    })),
    commitment: commitment
      ? {
          jobRef: commitment.jobRef,
          status: commitment.status,
          buyerAddress: commitment.buyerAddress,
          amountMinor: commitment.amountMinor,
          currency: commitment.currency,
          assetAddress: commitment.assetAddress,
          handoverCommit: commitment.handoverCommit,
          schemaUid: COMMITMENT_SCHEMA_UID,
          attestationUid: commitment.attestationUid,
          attestationUidExplorer: commitment.attestationUid
            ? easExplorerUrl(commitment.attestationUid)
            : null,
          attestationTxHash: commitment.attestationTxHash,
          attestationTxExplorer: explorerTx(commitment.attestationTxHash),
          attestationMode: commitment.attestationMode,
          attestedAt: commitment.attestedAt?.toISOString() ?? null,
        }
      : null,
    handover: handover
      ? {
          status: handover.status,
          outcome: handover.outcome,
          fulfilledAt: handover.fulfilledAt?.toISOString() ?? null,
          attesterAddress: handover.providerAddress,
          refUid: handover.refUid,
          schemaUid: HANDOVER_SCHEMA_UID,
          attestationUid: handover.attestationUid,
          attestationUidExplorer: handover.attestationUid
            ? easExplorerUrl(handover.attestationUid)
            : null,
          attestationTxHash: handover.attestationTxHash,
          attestationTxExplorer: explorerTx(handover.attestationTxHash),
          attestationMode: handover.attestationMode,
          attestedAt: handover.attestedAt?.toISOString() ?? null,
          signedByProvider:
            handover.status === "ATTESTED" && handover.attestationMode === "onchain",
        }
      : null,
    payments: payments.map((p) => ({
      provider: p.provider,
      asset: p.asset,
      amountAtomic: p.amountAtomic,
      payee: p.payee,
      status: p.status,
      txHash: p.txHash,
      txExplorer: explorerTx(p.txHash),
      createdAt: p.createdAt.toISOString(),
    })),
    timeline: events.map((e) => ({ type: e.type, at: e.createdAt.toISOString() })),
    consistency: {
      commitmentAttested: commitment?.status === "ATTESTED",
      handoverAttested: handover?.status === "ATTESTED",
      handoverReferencesCommitment:
        handover && commitment?.attestationUid
          ? handover.refUid === commitment.attestationUid
          : null,
      anySimulated: commitment?.attestationMode === "mock" || handover?.attestationMode === "mock",
    },
    disclaimer: DISCLAIMER,
  };
}
