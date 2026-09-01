import {
  encodeAbiParameters,
  encodePacked,
  getAddress,
  keccak256,
  parseAbiParameters,
  type Hex,
} from "viem";

/**
 * The two EAS schemas behind a physical fulfilment attestation (ADR-018).
 *
 * We register these against the canonical Celo mainnet SchemaRegistry and issue
 * attestations against the canonical EAS. We deploy no contracts of our own.
 *
 *   COMMITMENT  attested by Intra when a merchant's offer is accepted.
 *               Publishes `handoverCommit` *before* the job, so a later reveal
 *               cannot be backdated.
 *
 *   HANDOVER    attested by the **merchant**, `refUID` -> the commitment.
 *               Carries the revealed (code, salt). The merchant's signature
 *               proves their participation; possession of the buyer-held code
 *               proves the buyer handed it over in person.
 *
 * Both are revocable: a merchant or Intra can revoke a record later found to be
 * wrong. Neither is a payment receipt and neither asserts work quality.
 */

export const ATTESTATION_OUTCOMES = ["COMPLETED", "PARTIAL", "DISPUTED", "EXPIRED"] as const;
export type AttestationOutcome = (typeof ATTESTATION_OUTCOMES)[number];

/** On-chain `uint8 outcome`. Order is load-bearing — append only, never reorder. */
export function outcomeToUint8(outcome: AttestationOutcome): number {
  return ATTESTATION_OUTCOMES.indexOf(outcome);
}

export function outcomeFromUint8(value: number): AttestationOutcome | null {
  return ATTESTATION_OUTCOMES[value] ?? null;
}

export const COMMITMENT_SCHEMA =
  "bytes32 jobRef,uint256 providerAgentId,address buyer,uint256 amount,address asset,uint64 quotedAt,uint64 validUntil,bytes32 handoverCommit";

export const HANDOVER_SCHEMA =
  "bytes32 jobRef,uint256 providerAgentId,address buyer,uint64 fulfilledAt,uint8 outcome,string handoverCode,bytes32 handoverSalt";

/** No resolver contract — we deploy none (ADR-018). */
export const SCHEMA_RESOLVER = "0x0000000000000000000000000000000000000000" as const;
export const SCHEMA_REVOCABLE = true;

/**
 * EAS derives a schema's UID deterministically, exactly as `SchemaRegistry` does:
 * `keccak256(abi.encodePacked(schema, resolver, revocable))`.
 *
 * So we can compute both UIDs offline and assert them against the chain after
 * registration, rather than trusting a value pasted from a block explorer.
 */
export function schemaUid(
  schema: string,
  resolver: string = SCHEMA_RESOLVER,
  revocable: boolean = SCHEMA_REVOCABLE,
): Hex {
  return keccak256(
    encodePacked(["string", "address", "bool"], [schema, resolver as Hex, revocable]),
  );
}

export const COMMITMENT_SCHEMA_UID = schemaUid(COMMITMENT_SCHEMA);
export const HANDOVER_SCHEMA_UID = schemaUid(HANDOVER_SCHEMA);

export interface CommitmentAttestationData {
  /** keccak256 of the off-chain job record. No PII goes on-chain (NFR-SEC-001). */
  jobRef: Hex;
  /** ERC-8004 agentId of the merchant. 0n until that business is registered. */
  providerAgentId: bigint;
  buyer: Hex;
  /** Minor units of `asset`, matching the x402 adapter's convention. */
  amount: bigint;
  asset: Hex;
  quotedAt: bigint;
  /** The expiry that makes this a commitment rather than a quote. */
  validUntil: bigint;
  handoverCommit: Hex;
}

export interface HandoverAttestationData {
  jobRef: Hex;
  providerAgentId: bigint;
  buyer: Hex;
  fulfilledAt: bigint;
  outcome: AttestationOutcome;
  /** Revealed only here. Verifies against the commitment's `handoverCommit`. */
  handoverCode: string;
  handoverSalt: Hex;
}

/**
 * viem rejects an address that is not EIP-55 checksummed. The x402 adapter's
 * `networks.ts` deliberately stores token addresses byte-for-byte as the Celo
 * facilitator's `GET /supported` returned them, which is not checksummed — so
 * normalise at this boundary rather than editing the payment path. Throws on a
 * genuinely malformed address, which is what we want: a bad address does not
 * fail loudly on-chain, it just writes an attestation nobody can resolve.
 */
function address(value: string): Hex {
  return getAddress(value);
}

export function encodeCommitmentData(data: CommitmentAttestationData): Hex {
  return encodeAbiParameters(parseAbiParameters(COMMITMENT_SCHEMA), [
    data.jobRef,
    data.providerAgentId,
    address(data.buyer),
    data.amount,
    address(data.asset),
    data.quotedAt,
    data.validUntil,
    data.handoverCommit,
  ]);
}

export function encodeHandoverData(data: HandoverAttestationData): Hex {
  return encodeAbiParameters(parseAbiParameters(HANDOVER_SCHEMA), [
    data.jobRef,
    data.providerAgentId,
    address(data.buyer),
    data.fulfilledAt,
    outcomeToUint8(data.outcome),
    data.handoverCode,
    data.handoverSalt,
  ]);
}

/**
 * Stable `jobRef` for a task. The chain sees only this hash; the task id and
 * everything it points at stay off-chain.
 */
export function jobRef(taskId: string): Hex {
  return keccak256(encodePacked(["string", "string"], ["intra:job:", taskId]));
}
