import { keccak256, encodePacked, type Hex } from "viem";

import { readAttestationConfig, type AttestationConfig } from "./config";
import {
  COMMITMENT_SCHEMA_UID,
  encodeCommitmentData,
  HANDOVER_SCHEMA_UID,
  type CommitmentAttestationData,
  type DelegatedAttestMessage,
} from "./schema";

/**
 * The EAS write boundary (ADR-018).
 *
 * Domain code calls `EasWriter` and never learns whether the attestation went
 * to Celo mainnet or to the local mock. The mock exists because EAS has no
 * deployment on Celo Sepolia (see `config.ts`), so staging has nothing real to
 * write to — and a mock result is always labelled `mode: "mock"` so it can
 * never be mistaken for an on-chain fact (CLAUDE.md §4.1, §4.4).
 */

export interface CommitmentAttestationInput {
  data: CommitmentAttestationData;
  /** EAS attestation recipient. The provider's payout address. */
  recipient: Hex;
  /** Mirrors `data.validUntil`; EAS expires the attestation itself. */
  expirationTime: bigint;
}

export interface AttestationWriteResult {
  uid: Hex;
  txHash: Hex | null;
  mode: "mock" | "onchain";
  schemaUid: Hex;
  /** ABI-encoded Schema A payload, so callers and tests can verify it. */
  encodedData: Hex;
  /** Present only for a mock, restating that nothing was written to a chain. */
  simulated?: true;
  note?: string;
}

export class AttestationUnavailableError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AttestationUnavailableError";
  }
}

/** A `DelegatedAttestationRequest` already signed by the attester's own wallet. */
export interface DelegatedAttestationInput {
  message: DelegatedAttestMessage;
  /** 65-byte `eth_signTypedData_v4` signature, split by the caller. */
  signature: { v: number; r: Hex; s: Hex };
}

export interface EasWriter {
  readonly mode: "mock" | "onchain";
  attestCommitment(input: CommitmentAttestationInput): Promise<AttestationWriteResult>;
  /**
   * Relays a merchant-signed handover attestation. The signer of `message` is
   * the on-chain attester of record — this method never signs anything itself,
   * it only submits and pays gas (ADR-018 milestone 9's "non-signing referee").
   */
  attestHandoverDelegated(input: DelegatedAttestationInput): Promise<AttestationWriteResult>;
  /** The EAS account nonce a delegated request for `attester` must use next. */
  readDelegationNonce(attester: Hex): Promise<bigint>;
}

/**
 * Staging writer. Deterministic: the same commitment always yields the same
 * UID, so a retry is recognisably the same logical attestation rather than a
 * new one. Never touches a network.
 */
export class MockEasWriter implements EasWriter {
  readonly mode = "mock" as const;
  /** Every write this instance performed. Test/debug affordance only. */
  readonly writes: CommitmentAttestationInput[] = [];
  readonly handoverWrites: DelegatedAttestationInput[] = [];

  async attestCommitment(input: CommitmentAttestationInput): Promise<AttestationWriteResult> {
    const encodedData = encodeCommitmentData(input.data);
    this.writes.push(input);
    return {
      // Derived from the payload, not random — a deterministic stand-in for a
      // UID, and clearly domain-separated so it can never collide with a real one.
      uid: keccak256(
        encodePacked(
          ["string", "bytes32", "bytes"],
          ["intra:mock-eas:", COMMITMENT_SCHEMA_UID, encodedData],
        ),
      ),
      txHash: null,
      mode: "mock",
      schemaUid: COMMITMENT_SCHEMA_UID,
      encodedData,
      simulated: true,
      note:
        "Simulated locally. EAS is not deployed on Celo Sepolia, so nothing was written to any " +
        "chain. This is not a real attestation.",
    };
  }

  async attestHandoverDelegated(input: DelegatedAttestationInput): Promise<AttestationWriteResult> {
    this.handoverWrites.push(input);
    return {
      uid: keccak256(
        encodePacked(
          ["string", "bytes32", "bytes"],
          ["intra:mock-eas-handover:", HANDOVER_SCHEMA_UID, input.message.data],
        ),
      ),
      txHash: null,
      mode: "mock",
      schemaUid: HANDOVER_SCHEMA_UID,
      encodedData: input.message.data,
      simulated: true,
      note:
        "Simulated locally. EAS is not deployed on Celo Sepolia, so nothing was written to any " +
        "chain. This is not a real attestation, and no wallet actually signed it on any network.",
    };
  }

  /** Mock mode never signs for real, so the nonce is inert — always 0. */
  async readDelegationNonce(): Promise<bigint> {
    return 0n;
  }
}

/** Minimal EAS ABI — only `attest`. We deploy and modify nothing (ADR-018). */
export const EAS_ATTEST_ABI = [
  {
    name: "attest",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

/**
 * `attestByDelegation` + `getNonce` — the core EAS contract's own delegation
 * primitive (no proxy contract involved; verified against
 * `eas-contracts/contracts/{EAS,eip1271/EIP1271Verifier}.sol`, 2026-09-05).
 * `attester` is an explicit field distinct from `msg.sender`, which is the
 * entire mechanism: the relayer (Intra, `msg.sender`) pays gas, the attester
 * (the merchant) is whoever the verified EIP-712 signature says it is.
 */
export const EAS_ATTEST_BY_DELEGATION_ABI = [
  {
    name: "attestByDelegation",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "delegatedRequest",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
          {
            name: "signature",
            type: "tuple",
            components: [
              { name: "v", type: "uint8" },
              { name: "r", type: "bytes32" },
              { name: "s", type: "bytes32" },
            ],
          },
          { name: "attester", type: "address" },
          { name: "deadline", type: "uint64" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "getNonce",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Celo mainnet writer. Submits to the canonical EAS deployment with the
 * registered commitment schema.
 *
 * Deliberately constructed lazily: `viem`'s wallet/public clients are only
 * created inside `attestCommitment`, so importing this module in a test or in
 * staging never opens a connection or reads a key.
 */
export class RealEasWriter implements EasWriter {
  readonly mode = "onchain" as const;

  constructor(
    private readonly config: AttestationConfig,
    private readonly signerKey: string,
  ) {}

  /**
   * Lazily built so importing this module never opens a connection or reads a
   * key — same discipline as the original `attestCommitment`, just factored
   * out so the delegated path can share it.
   */
  private async clients() {
    const [
      { createWalletClient, createPublicClient, http, getAddress },
      { privateKeyToAccount },
      { celo },
    ] = await Promise.all([import("viem"), import("viem/accounts"), import("viem/chains")]);

    const account = privateKeyToAccount(
      (this.signerKey.startsWith("0x") ? this.signerKey : `0x${this.signerKey}`) as Hex,
    );
    const transport = http(this.config.rpcUrl);
    return {
      getAddress,
      account,
      wallet: createWalletClient({ account, chain: celo, transport }),
      publicClient: createPublicClient({ chain: celo, transport }),
    };
  }

  /** Extracts the returned `bytes32` UID from an `attest`/`attestByDelegation` receipt. */
  private readUidFromReceipt(
    txHash: Hex,
    receipt: { status: string; logs: readonly { data: Hex }[] },
  ) {
    if (receipt.status !== "success") {
      throw new AttestationUnavailableError(
        "ATTEST_REVERTED",
        `The EAS attestation transaction ${txHash} reverted.`,
      );
    }
    const uid = receipt.logs[0]?.data?.slice(0, 66) as Hex | undefined;
    if (!uid || !/^0x[0-9a-fA-F]{64}$/.test(uid)) {
      throw new AttestationUnavailableError(
        "ATTEST_UID_UNREADABLE",
        `The transaction ${txHash} succeeded but no attestation UID could be read from it.`,
      );
    }
    return uid;
  }

  async attestCommitment(input: CommitmentAttestationInput): Promise<AttestationWriteResult> {
    const encodedData = encodeCommitmentData(input.data);
    const { getAddress, wallet, publicClient } = await this.clients();

    const txHash = await wallet.writeContract({
      address: getAddress(this.config.eas) as Hex,
      abi: EAS_ATTEST_ABI,
      functionName: "attest",
      args: [
        {
          schema: COMMITMENT_SCHEMA_UID,
          data: {
            recipient: getAddress(input.recipient) as Hex,
            expirationTime: input.expirationTime,
            revocable: true,
            refUID: `0x${"0".repeat(64)}` as Hex,
            data: encodedData,
            value: 0n,
          },
        },
      ],
    });

    // The UID is the attest() return value; read it back from the receipt
    // rather than guessing, so a stored UID is always one the chain agrees with.
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const uid = this.readUidFromReceipt(txHash, receipt);

    return { uid, txHash, mode: "onchain", schemaUid: COMMITMENT_SCHEMA_UID, encodedData };
  }

  /** Read-only. No gas, no signature — safe to call at any time, including to size a signing request. */
  async readDelegationNonce(attester: Hex): Promise<bigint> {
    const { getAddress, publicClient } = await this.clients();
    return publicClient.readContract({
      address: getAddress(this.config.eas) as Hex,
      abi: EAS_ATTEST_BY_DELEGATION_ABI,
      functionName: "getNonce",
      args: [getAddress(attester) as Hex],
    });
  }

  /**
   * Relays an already-signed delegated attestation. This method holds no
   * opinion about who `message.attester` is and never produces a signature
   * itself — `handover-service.ts` verifies the signature recovers to the
   * expected merchant address BEFORE calling this, and the EAS contract
   * verifies it again independently on-chain. Relaying is `msg.sender`;
   * `getAddress` below reads the RELAYER's own address for logging/parity
   * with `attestCommitment`, never the attester.
   */
  async attestHandoverDelegated(input: DelegatedAttestationInput): Promise<AttestationWriteResult> {
    const { getAddress, wallet, publicClient } = await this.clients();
    const { message, signature } = input;

    const txHash = await wallet.writeContract({
      address: getAddress(this.config.eas) as Hex,
      abi: EAS_ATTEST_BY_DELEGATION_ABI,
      functionName: "attestByDelegation",
      args: [
        {
          schema: message.schema,
          data: {
            recipient: getAddress(message.recipient) as Hex,
            expirationTime: message.expirationTime,
            revocable: message.revocable,
            refUID: message.refUID,
            data: message.data,
            value: message.value,
          },
          signature: { v: signature.v, r: signature.r, s: signature.s },
          attester: getAddress(message.attester) as Hex,
          deadline: message.deadline,
        },
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const uid = this.readUidFromReceipt(txHash, receipt);

    return { uid, txHash, mode: "onchain", schemaUid: message.schema, encodedData: message.data };
  }
}

/**
 * Chooses the writer from the environment. `config.onChain` is the single gate:
 * it is true only in production WITH a signer, so a missing key degrades to the
 * mock rather than fabricating a result.
 */
export function getEasWriter(env: NodeJS.ProcessEnv = process.env): EasWriter {
  const config = readAttestationConfig(env);
  if (!config.onChain) return new MockEasWriter();

  const signerKey = env.ATTESTATION_SIGNER_KEY?.trim();
  if (!signerKey) return new MockEasWriter();
  return new RealEasWriter(config, signerKey);
}
