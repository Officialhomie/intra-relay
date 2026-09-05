import {
  encodeAbiParameters,
  encodePacked,
  getAddress,
  keccak256,
  parseAbiParameters,
  recoverTypedDataAddress,
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

/**
 * EAS's own `attestByDelegation` (core contract, no proxy — verified against
 * `eas-contracts` `EIP1271Verifier.sol` / `EAS.sol`, 2026-09-05). It takes an
 * explicit `attester` distinct from whoever submits the transaction: the
 * attester signs this EIP-712 struct off-chain, and ANY funded account can
 * relay it on-chain while the recorded attester stays genuinely theirs. This
 * is the entire mechanism behind a merchant signing their own handover
 * attestation while Intra only pays gas (ADR-018 milestone 9).
 *
 * Domain name/version are the EAS contract's own (`EAS`, `1.4.0` at the time
 * of writing) — not ours to choose, and wrong values simply fail to recover
 * the right signer rather than throwing.
 */
export const EAS_EIP712_DOMAIN_NAME = "EAS";
export const EAS_EIP712_DOMAIN_VERSION = "1.4.0";

export const EAS_DELEGATED_ATTEST_TYPES = {
  Attest: [
    { name: "attester", type: "address" },
    { name: "schema", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "expirationTime", type: "uint64" },
    { name: "revocable", type: "bool" },
    { name: "refUID", type: "bytes32" },
    { name: "data", type: "bytes" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export interface DelegatedAttestMessage {
  attester: Hex;
  schema: Hex;
  recipient: Hex;
  expirationTime: bigint;
  revocable: boolean;
  refUID: Hex;
  data: Hex;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}

/**
 * The exact typed-data object a merchant's wallet must sign
 * (`eth_signTypedData_v4`), and the exact object the server recomputes before
 * trusting a returned signature. Building it in one place means the value the
 * merchant is shown, the value hashed for the signature, and the value
 * relayed on-chain can never silently drift apart.
 */
export function buildDelegatedAttestTypedData(
  message: DelegatedAttestMessage,
  chainId: number,
  verifyingContract: Hex,
) {
  return {
    domain: {
      name: EAS_EIP712_DOMAIN_NAME,
      version: EAS_EIP712_DOMAIN_VERSION,
      chainId,
      verifyingContract,
    },
    types: EAS_DELEGATED_ATTEST_TYPES,
    primaryType: "Attest" as const,
    message,
  };
}

export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;

/**
 * Recovers the signer of a delegated-attest EIP-712 signature and confirms it
 * is genuinely `message.attester` — the check that turns "a signature exists"
 * into "the merchant themselves signed this exact message" (M9 §19: altered
 * payload / wrong signer / cross-task signature must all fail here). Called
 * server-side before ever relaying a request on-chain; the EAS contract
 * enforces the same check independently, so this is defense in depth, not the
 * only gate.
 */
export async function verifyDelegatedAttestSignature(
  message: DelegatedAttestMessage,
  signature: Hex,
  chainId: number,
  verifyingContract: Hex,
): Promise<boolean> {
  const typedData = buildDelegatedAttestTypedData(message, chainId, verifyingContract);
  const recovered = await recoverTypedDataAddress({ ...typedData, signature });
  return getAddress(recovered) === getAddress(message.attester);
}
