import { toDataSuffix } from "@celo/attribution-tags";
import { decodeAbiParameters, parseAbiParameters, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { readAttestationConfig } from "./config";
import {
  computeHandoverCommit,
  handoverCodeMatches,
  HANDOVER_CODE_LENGTH,
  issueHandoverSecret,
  normalizeHandoverCode,
  verifyHandoverReveal,
} from "./handover";
import { appendAttributionSuffix } from "./writer";
import {
  ATTESTATION_OUTCOMES,
  buildDelegatedAttestTypedData,
  COMMITMENT_SCHEMA,
  COMMITMENT_SCHEMA_UID,
  encodeCommitmentData,
  encodeHandoverData,
  HANDOVER_SCHEMA,
  HANDOVER_SCHEMA_UID,
  jobRef,
  outcomeFromUint8,
  outcomeToUint8,
  schemaUid,
  verifyDelegatedAttestSignature,
  ZERO_BYTES32,
  type DelegatedAttestMessage,
} from "./schema";

const BUYER = "0x1111111111111111111111111111111111111111" as Hex;
/** Exactly as `payments/adapter/networks.ts` stores it — NOT EIP-55 checksummed. */
const ASSET_AS_STORED = "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C" as Hex; // USDC on Celo
const ASSET = ASSET_AS_STORED;

describe("handover secret — two-party anti-fabrication (AC-ATT-001)", () => {
  it("issues a speakable code, a 32-byte salt, and an opening commit", () => {
    const { code, salt, commit } = issueHandoverSecret();
    expect(code).toHaveLength(HANDOVER_CODE_LENGTH);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/); // no 0/O/1/I/L
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verifyHandoverReveal(commit, code, salt)).toBe(true);
  });

  it("does not open the commit without the buyer's code (AC-ATT-001)", () => {
    const { salt, commit } = issueHandoverSecret();
    expect(verifyHandoverReveal(commit, "WRONGCOD", salt)).toBe(false);
  });

  it("does not open the commit without the withheld salt (AC-ATT-001)", () => {
    const { code, commit } = issueHandoverSecret();
    const otherSalt = issueHandoverSecret().salt;
    expect(verifyHandoverReveal(commit, code, otherSalt)).toBe(false);
  });

  it("issues a distinct secret every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => issueHandoverSecret().commit));
    expect(seen.size).toBe(50);
  });

  it("accepts the code as it is actually spoken and typed back", () => {
    const { code, salt, commit } = issueHandoverSecret();
    const asTyped = ` ${code.toLowerCase().slice(0, 4)}-${code.toLowerCase().slice(4)} `;
    expect(normalizeHandoverCode(asTyped)).toBe(code);
    expect(handoverCodeMatches(asTyped, code)).toBe(true);
    expect(verifyHandoverReveal(commit, asTyped, salt)).toBe(true);
  });

  it("rejects an empty or wrong-length candidate without throwing", () => {
    const { code } = issueHandoverSecret();
    expect(handoverCodeMatches("", code)).toBe(false);
    expect(handoverCodeMatches("AB", code)).toBe(false);
  });

  it("commits deterministically for the same (code, salt)", () => {
    const salt = issueHandoverSecret().salt;
    expect(computeHandoverCommit("ABCD2345", salt)).toBe(computeHandoverCommit("abcd2345", salt));
  });
});

describe("EAS schema definitions (AC-ATT-002)", () => {
  it("derives UIDs the way SchemaRegistry does, and they are stable", () => {
    // Pinned literals. If a schema string changes, its UID changes and every
    // existing attestation is orphaned — fail loudly, do not update. The
    // handover UID was also confirmed UNregistered on Celo mainnet (M9 §4),
    // so registering it against exactly this string is still open.
    expect(COMMITMENT_SCHEMA_UID).toBe(schemaUid(COMMITMENT_SCHEMA));
    expect(HANDOVER_SCHEMA_UID).toBe(schemaUid(HANDOVER_SCHEMA));
    expect(HANDOVER_SCHEMA_UID).toBe(
      "0x227c09b14a728e1bef6b3f13b9bfdc1119f65c97e7f0055863625eed5d0ab09b",
    );
    expect(COMMITMENT_SCHEMA_UID).not.toBe(HANDOVER_SCHEMA_UID);
    expect(COMMITMENT_SCHEMA_UID).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("keeps the outcome enum append-only", () => {
    expect(ATTESTATION_OUTCOMES).toEqual(["COMPLETED", "PARTIAL", "DISPUTED", "EXPIRED"]);
    expect(outcomeToUint8("COMPLETED")).toBe(0);
    expect(outcomeFromUint8(0)).toBe("COMPLETED");
    expect(outcomeFromUint8(99)).toBeNull();
  });

  it("puts no PII on-chain — jobRef is a hash of the task id (NFR-SEC-001)", () => {
    const ref = jobRef("task_abc123");
    expect(ref).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ref).toBe(jobRef("task_abc123"));
    expect(ref).not.toBe(jobRef("task_abc124"));
    expect(ref).not.toContain("task");
  });
});

describe("attestation encoding (AC-ATT-003)", () => {
  it("round-trips commitment data through ABI encoding", () => {
    const { commit } = issueHandoverSecret();
    const data = {
      jobRef: jobRef("task_1"),
      providerAgentId: 42n,
      buyer: BUYER,
      amount: 48_000_000n,
      asset: ASSET,
      quotedAt: 1_788_000_000n,
      validUntil: 1_788_003_600n,
      handoverCommit: commit,
    };
    const decoded = decodeAbiParameters(
      parseAbiParameters(COMMITMENT_SCHEMA),
      encodeCommitmentData(data),
    );
    expect(decoded[1]).toBe(42n);
    expect(decoded[3]).toBe(48_000_000n);
    expect(decoded[6]).toBe(1_788_003_600n);
    expect(decoded[7]).toBe(commit);
  });

  it("accepts a token address exactly as networks.ts stores it (not checksummed)", () => {
    // Regression guard: viem throws on a non-EIP-55 address, and the x402
    // adapter stores the facilitator's response verbatim. Encoding must
    // normalise rather than blow up on the payment path's own constants.
    expect(() =>
      encodeCommitmentData({
        jobRef: jobRef("task_2"),
        providerAgentId: 0n,
        buyer: BUYER,
        amount: 1n,
        asset: ASSET_AS_STORED,
        quotedAt: 1n,
        validUntil: 2n,
        handoverCommit: issueHandoverSecret().commit,
      }),
    ).not.toThrow();
  });

  it("round-trips a handover reveal that still opens the commit (AC-ATT-004)", () => {
    const { code, salt, commit } = issueHandoverSecret();
    const decoded = decodeAbiParameters(
      parseAbiParameters(HANDOVER_SCHEMA),
      encodeHandoverData({
        jobRef: jobRef("task_1"),
        providerAgentId: 42n,
        buyer: BUYER,
        fulfilledAt: 1_788_002_000n,
        outcome: "COMPLETED",
        handoverCode: code,
        handoverSalt: salt,
      }),
    );
    expect(decoded[4]).toBe(0); // COMPLETED
    // A third party reads the reveal off-chain and re-opens the published commit.
    expect(verifyHandoverReveal(commit, decoded[5] as string, decoded[6] as Hex)).toBe(true);
  });
});

describe("delegated attestation signing (M9 §2, §19) — pure local crypto, no network", () => {
  // A throwaway local test key, never a real signer. `privateKeyToAccount` and
  // `signTypedData` run entirely offline — this is the same class of test as
  // the ABI round-trips above, not a network test (M9 §22).
  const MERCHANT_KEY = `0x${"7".repeat(64)}` as Hex;
  const merchant = privateKeyToAccount(MERCHANT_KEY);
  const EAS = "0x72E1d8ccf5299fb36fEfD8CC4394B8ef7e98Af92" as Hex; // Celo mainnet EAS
  const CHAIN_ID = 42220;

  function baseMessage(): DelegatedAttestMessage {
    const data = encodeHandoverData({
      jobRef: jobRef("task_delegated_1"),
      providerAgentId: 0n,
      buyer: BUYER,
      fulfilledAt: 1_788_002_000n,
      outcome: "COMPLETED",
      handoverCode: "ABCD2345",
      handoverSalt: issueHandoverSecret().salt,
    });
    return {
      attester: merchant.address,
      schema: HANDOVER_SCHEMA_UID,
      recipient: merchant.address,
      expirationTime: 0n,
      revocable: true,
      refUID: ZERO_BYTES32,
      data,
      value: 0n,
      nonce: 0n,
      deadline: 9_999_999_999n,
    };
  }

  async function sign(message: DelegatedAttestMessage): Promise<Hex> {
    const typedData = buildDelegatedAttestTypedData(message, CHAIN_ID, EAS);
    return merchant.signTypedData(typedData);
  }

  it("verifies a genuine signature from the claimed attester", async () => {
    const message = baseMessage();
    const signature = await sign(message);
    expect(await verifyDelegatedAttestSignature(message, signature, CHAIN_ID, EAS)).toBe(true);
  });

  it("rejects a signature when the message claims a different attester (wrong signer)", async () => {
    const message = baseMessage();
    const signature = await sign(message);
    const impersonated = {
      ...message,
      attester: "0x2222222222222222222222222222222222222222" as Hex,
    };
    expect(await verifyDelegatedAttestSignature(impersonated, signature, CHAIN_ID, EAS)).toBe(
      false,
    );
  });

  it("rejects a signature after any field is altered post-signing", async () => {
    const message = baseMessage();
    const signature = await sign(message);
    const altered = { ...message, deadline: message.deadline + 1n };
    expect(await verifyDelegatedAttestSignature(altered, signature, CHAIN_ID, EAS)).toBe(false);
  });

  it("rejects a signature replayed against a different jobRef (cross-task replay)", async () => {
    const message = baseMessage();
    const signature = await sign(message);
    const otherTask = {
      ...message,
      data: encodeHandoverData({
        jobRef: jobRef("task_delegated_2"), // a different task
        providerAgentId: 0n,
        buyer: BUYER,
        fulfilledAt: 1_788_002_000n,
        outcome: "COMPLETED",
        handoverCode: "ABCD2345",
        handoverSalt: issueHandoverSecret().salt,
      }),
    };
    expect(await verifyDelegatedAttestSignature(otherTask, signature, CHAIN_ID, EAS)).toBe(false);
  });

  it("rejects a signature bound to the wrong chain", async () => {
    const message = baseMessage();
    const signature = await sign(message);
    expect(await verifyDelegatedAttestSignature(message, signature, 1, EAS)).toBe(false);
  });

  it("rejects a signature bound to the wrong verifying contract", async () => {
    const message = baseMessage();
    const signature = await sign(message);
    const otherContract = "0x3333333333333333333333333333333333333333" as Hex;
    expect(await verifyDelegatedAttestSignature(message, signature, CHAIN_ID, otherContract)).toBe(
      false,
    );
  });
});

describe("ERC-8021 attribution on mainnet attestations (hackathon registration)", () => {
  const TAG = "celo_c237d3b3be9f";
  // A real encoded EAS `attest` call is irrelevant to the suffix rule — what
  // matters is that arbitrary calldata survives untouched with the tag behind it.
  const CALLDATA = "0xdeadbeef" as const;

  it("leaves calldata byte-for-byte unchanged when no tag is configured", () => {
    expect(appendAttributionSuffix(CALLDATA, null)).toBe(CALLDATA);
  });

  it("appends the tag as a strict suffix, preserving the original call", () => {
    const tagged = appendAttributionSuffix(CALLDATA, TAG);
    expect(tagged.startsWith(CALLDATA)).toBe(true);
    expect(tagged.length).toBeGreaterThan(CALLDATA.length);
    expect(tagged.slice(0, CALLDATA.length)).toBe(CALLDATA);
  });

  it("produces a suffix that decodes back to the same tag", () => {
    const tagged = appendAttributionSuffix(CALLDATA, TAG);
    const suffix = `0x${tagged.slice(CALLDATA.length)}`;
    expect(suffix).toBe(toDataSuffix(TAG));
  });

  it("reads a valid tag from the environment into the attestation config", () => {
    const cfg = readAttestationConfig({
      NETWORK_ENV: "production",
      ATTESTATION_SIGNER_KEY: `0x${"1".repeat(64)}`,
      X402_ATTRIBUTION_TAG: TAG,
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.attributionTag).toBe(TAG);
    expect(cfg.onChain).toBe(true);
  });

  it("ignores a malformed tag rather than sending a bad suffix", () => {
    const cfg = readAttestationConfig({
      NETWORK_ENV: "production",
      ATTESTATION_SIGNER_KEY: `0x${"1".repeat(64)}`,
      X402_ATTRIBUTION_TAG: "not-a-celo-tag",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.attributionTag).toBeNull();
  });

  it("carries no tag when the environment has none", () => {
    const cfg = readAttestationConfig({
      NETWORK_ENV: "production",
      ATTESTATION_SIGNER_KEY: `0x${"1".repeat(64)}`,
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.attributionTag).toBeNull();
  });
});
