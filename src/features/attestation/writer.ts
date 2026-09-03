import { keccak256, encodePacked, type Hex } from "viem";

import { readAttestationConfig, type AttestationConfig } from "./config";
import {
  COMMITMENT_SCHEMA_UID,
  encodeCommitmentData,
  type CommitmentAttestationData,
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

export interface EasWriter {
  readonly mode: "mock" | "onchain";
  attestCommitment(input: CommitmentAttestationInput): Promise<AttestationWriteResult>;
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

  async attestCommitment(input: CommitmentAttestationInput): Promise<AttestationWriteResult> {
    const encodedData = encodeCommitmentData(input.data);

    const [
      { createWalletClient, createPublicClient, http, getAddress },
      { privateKeyToAccount },
      { celo },
    ] = await Promise.all([import("viem"), import("viem/accounts"), import("viem/chains")]);

    const account = privateKeyToAccount(
      (this.signerKey.startsWith("0x") ? this.signerKey : `0x${this.signerKey}`) as Hex,
    );
    const transport = http(this.config.rpcUrl);
    const wallet = createWalletClient({ account, chain: celo, transport });
    const publicClient = createPublicClient({ chain: celo, transport });

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

    return { uid, txHash, mode: "onchain", schemaUid: COMMITMENT_SCHEMA_UID, encodedData };
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
