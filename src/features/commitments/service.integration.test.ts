// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { commitments } from "@/lib/db/schema";
import { verifyHandoverReveal } from "@/features/attestation/handover";
import {
  COMMITMENT_SCHEMA,
  COMMITMENT_SCHEMA_UID,
  encodeCommitmentData,
  jobRef,
  schemaUid,
} from "@/features/attestation/schema";
import {
  AttestationUnavailableError,
  MockEasWriter,
  RealEasWriter,
  getEasWriter,
  type EasWriter,
} from "@/features/attestation/writer";
import { readAttestationConfig } from "@/features/attestation/config";
import { submitQuote } from "@/features/quotes/service";
import { createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";
import { decodeAbiParameters, parseAbiParameters, type Hex } from "viem";

import { findCommitmentByTaskId } from "./repository";
import { attestCommitment, toAttestationData, toPublicCommitment } from "./service";
import { assetAddressForCurrency, OFF_CHAIN_ASSET, resolveValidUntil } from "./status";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "buyer-session-abcd1234";

/** Drive a task to the point a human has approved a real quote. */
async function approvedTask(quoteOverrides: Record<string, unknown> = {}) {
  const { business, route } = await createActiveRoute(db);
  const task = await createTask(db, SESSION, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, SESSION);
  await submitQuote(db, route.id, {
    taskId: task.id,
    amountMin: 45000,
    turnaround: "24 hours",
    fixed: true,
    confidence: "high",
    deliveryCharge: 2000,
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    ...quoteOverrides,
  });
  const decision = await decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" });
  return { business, route, task, decision };
}

// --- Schema A regression ---------------------------------------------------

describe("Schema A definition (AC-ATT-002)", () => {
  it("still derives the production commitment UID", () => {
    // Pinned literal. If a field is added, reordered or retyped, the UID moves
    // and every existing attestation is orphaned — fail loudly, do not update.
    expect(COMMITMENT_SCHEMA_UID).toBe(
      "0xb0cfb67dc3388e20bf26dc9ffabb65e731347fa1879cd7c2b4e3f42a03ca6ee3",
    );
    expect(schemaUid(COMMITMENT_SCHEMA)).toBe(COMMITMENT_SCHEMA_UID);
  });

  it("field order matches what the encoder writes", () => {
    expect(COMMITMENT_SCHEMA.split(",").map((f) => f.trim().split(" ")[1])).toEqual([
      "jobRef",
      "providerAgentId",
      "buyer",
      "amount",
      "asset",
      "quotedAt",
      "validUntil",
      "handoverCommit",
    ]);
  });
});

// --- creation --------------------------------------------------------------

describe("commitment creation on human approval", () => {
  it("creates exactly one commitment from the approved quote", async () => {
    const { task, business } = await approvedTask();
    const row = await findCommitmentByTaskId(db, task.id);

    expect(row).not.toBeNull();
    expect(row!.status).toBe("PENDING_ATTESTATION");
    expect(row!.jobRef).toBe(jobRef(task.id));
    expect(row!.providerAddress).toBe(business.payoutAddress);
    // Price + delivery, in minor units.
    expect(row!.amountMinor).toBe("4700000");
    expect(row!.currency).toBe("NGN");
    // NGN is fiat: no token address may be claimed.
    expect(row!.assetAddress).toBe(OFF_CHAIN_ASSET);
    expect(row!.expirySource).toBe("QUOTE_EXPIRY");
    expect(new Date(row!.validUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not create a commitment when the buyer declines", async () => {
    const { business, route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, SESSION);
    await submitQuote(db, route.id, {
      taskId: task.id,
      amountMin: 45000,
      turnaround: "24 hours",
      fixed: true,
    });
    await decideOnQuote(db, task.id, SESSION, { decision: "DECLINE", reason: "too slow" });

    expect(await findCommitmentByTaskId(db, task.id)).toBeNull();
    expect(await db.select().from(commitments)).toHaveLength(0);
    void business;
  });

  it("always assigns a meaningful expiry, even when the printer gave none", async () => {
    const { task } = await approvedTask({ expiresAt: undefined });
    const row = await findCommitmentByTaskId(db, task.id);
    expect(row!.expirySource).toBe("DEFAULT_WINDOW");
    expect(new Date(row!.validUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("issues a handover secret whose commit the existing reveal check opens", async () => {
    const { task } = await approvedTask();
    const row = await findCommitmentByTaskId(db, task.id);
    // The stored commit is exactly what handover.ts produces — the cryptographic
    // mechanism is reused, not reimplemented.
    expect(
      verifyHandoverReveal(row!.handoverCommit as Hex, row!.handoverCode, row!.handoverSalt as Hex),
    ).toBe(true);
    expect(
      verifyHandoverReveal(row!.handoverCommit as Hex, "WRONGCOD", row!.handoverSalt as Hex),
    ).toBe(false);
  });

  it("never exposes the salt or the buyer's code through the public view (NFR-SEC-001)", async () => {
    const { task } = await approvedTask();
    const row = await findCommitmentByTaskId(db, task.id);
    const view = toPublicCommitment(row!) as Record<string, unknown>;

    expect(view.handoverCommit).toBe(row!.handoverCommit);
    expect(Object.keys(view)).not.toContain("handoverSalt");
    expect(Object.keys(view)).not.toContain("handoverCode");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(row!.handoverSalt);
    expect(serialized).not.toContain(row!.handoverCode);
  });

  it("puts no PII on-chain — only a job hash", async () => {
    const { task } = await approvedTask();
    const row = await findCommitmentByTaskId(db, task.id);
    const encoded = encodeCommitmentData(toAttestationData(row!));

    expect(row!.jobRef).toMatch(/^0x[0-9a-f]{64}$/);
    expect(encoded).not.toContain(Buffer.from(SESSION).toString("hex"));
    expect(encoded).not.toContain(Buffer.from(task.id).toString("hex"));
    // No salt or code reaches the payload either.
    expect(encoded.toLowerCase()).not.toContain(row!.handoverSalt.slice(2).toLowerCase());
  });
});

// --- attestation -----------------------------------------------------------

describe("commitment attestation", () => {
  it("writes through the mock writer and stores the UID", async () => {
    const { task } = await approvedTask();
    const writer = new MockEasWriter();
    const result = await attestCommitment(db, task.id, writer);

    expect(result.wrote).toBe(true);
    expect(result.mode).toBe("mock");
    expect(result.commitment.status).toBe("ATTESTED");
    expect(result.commitment.attestationUid).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.commitment.attestationTxHash).toBeNull();
    expect(writer.writes).toHaveLength(1);
  });

  it("encodes exactly the commitment the database holds", async () => {
    const { task, business } = await approvedTask();
    const writer = new MockEasWriter();
    await attestCommitment(db, task.id, writer);

    const row = await findCommitmentByTaskId(db, task.id);
    const written = writer.writes[0];
    expect(written.recipient).toBe(business.payoutAddress);

    const decoded = decodeAbiParameters(
      parseAbiParameters(COMMITMENT_SCHEMA),
      encodeCommitmentData(written.data),
    );
    expect(decoded[0]).toBe(jobRef(task.id)); // jobRef
    expect(decoded[1]).toBe(0n); // providerAgentId — not registered yet
    expect(decoded[3]).toBe(4_700_000n); // amount, minor units
    expect((decoded[4] as string).toLowerCase()).toBe(OFF_CHAIN_ASSET); // asset
    expect(decoded[6]).toBe(BigInt(Math.floor(new Date(row!.validUntil).getTime() / 1000)));
    expect(decoded[7]).toBe(row!.handoverCommit); // handoverCommit
  });

  it("labels a mock result as simulated and never as on-chain", async () => {
    const { task } = await approvedTask();
    const writer = new MockEasWriter();
    const written = await writer.attestCommitment({
      data: toAttestationData((await findCommitmentByTaskId(db, task.id))!),
      recipient: `0x${"a".repeat(40)}`,
      expirationTime: 0n,
    });
    expect(written.mode).toBe("mock");
    expect(written.simulated).toBe(true);
    expect(written.note).toMatch(/not a real attestation/i);

    await attestCommitment(db, task.id, writer);
    const view = toPublicCommitment((await findCommitmentByTaskId(db, task.id))!);
    expect(view.simulated).toBe(true);
    expect(view.attestationMode).toBe("mock");
  });

  it("is idempotent — a retry returns the stored UID and does not write again", async () => {
    const { task } = await approvedTask();
    const writer = new MockEasWriter();

    const first = await attestCommitment(db, task.id, writer);
    const second = await attestCommitment(db, task.id, writer);

    expect(first.wrote).toBe(true);
    expect(second.wrote).toBe(false);
    expect(second.commitment.attestationUid).toBe(first.commitment.attestationUid);
    expect(writer.writes).toHaveLength(1);
    expect(await db.select().from(commitments)).toHaveLength(1);
  });

  it("produces a deterministic mock UID for the same commitment", async () => {
    const { task } = await approvedTask();
    const data = toAttestationData((await findCommitmentByTaskId(db, task.id))!);
    const input = { data, recipient: `0x${"a".repeat(40)}` as Hex, expirationTime: 0n };
    const a = await new MockEasWriter().attestCommitment(input);
    const b = await new MockEasWriter().attestCommitment(input);
    expect(a.uid).toBe(b.uid);
  });

  it("records ATTESTATION_FAILED — never ATTESTED — when the writer throws", async () => {
    const { task } = await approvedTask();
    const broken: EasWriter = {
      mode: "onchain",
      attestCommitment: async () => {
        throw new AttestationUnavailableError("RPC_DOWN", "Celo RPC unreachable.");
      },
      attestHandoverDelegated: async () => {
        throw new AttestationUnavailableError("RPC_DOWN", "Celo RPC unreachable.");
      },
      readDelegationNonce: async () => 0n,
    };
    const result = await attestCommitment(db, task.id, broken);

    expect(result.wrote).toBe(false);
    expect(result.commitment.status).toBe("ATTESTATION_FAILED");
    expect(result.commitment.attestationUid).toBeNull();
    expect(result.commitment.attestationError).toContain("RPC_DOWN");
    expect(result.commitment.attemptCount).toBe(1);
  });

  it("keeps a failed attestation retryable without losing the approval", async () => {
    const { task } = await approvedTask();
    const broken: EasWriter = {
      mode: "onchain",
      attestCommitment: async () => {
        throw new Error("transient");
      },
      attestHandoverDelegated: async () => {
        throw new Error("transient");
      },
      readDelegationNonce: async () => 0n,
    };
    await attestCommitment(db, task.id, broken);

    // The approval survived and a later retry succeeds.
    const recovered = await attestCommitment(db, task.id, new MockEasWriter());
    expect(recovered.commitment.status).toBe("ATTESTED");
    expect(recovered.commitment.attestationUid).toMatch(/^0x[0-9a-f]{64}$/);
    expect(recovered.commitment.attemptCount).toBe(2);
  });

  it("refuses to attest a commitment that has already expired", async () => {
    const { task } = await approvedTask();
    const row = await findCommitmentByTaskId(db, task.id);
    const wayLater = new Date(new Date(row!.validUntil).getTime() + 60_000);

    const writer = new MockEasWriter();
    const result = await attestCommitment(db, task.id, writer, wayLater);

    expect(result.commitment.status).toBe("ATTESTATION_FAILED");
    expect(result.commitment.attestationError).toContain("COMMITMENT_EXPIRED");
    expect(writer.writes).toHaveLength(0);
  });
});

// --- writer selection ------------------------------------------------------

describe("writer selection and mainnet safety", () => {
  it("uses the mock in staging", () => {
    expect(getEasWriter({ NETWORK_ENV: "staging" } as unknown as NodeJS.ProcessEnv).mode).toBe(
      "mock",
    );
  });

  it("does not fabricate success in production without a signer", () => {
    const config = readAttestationConfig({
      NETWORK_ENV: "production",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.onChain).toBe(false);
    expect(config.mode).toBe("mock");
    expect(config.reason).toMatch(/ATTESTATION_SIGNER_KEY is unset/);
    expect(getEasWriter({ NETWORK_ENV: "production" } as unknown as NodeJS.ProcessEnv).mode).toBe(
      "mock",
    );
  });

  it("selects the real writer only in production WITH a signer", () => {
    const writer = getEasWriter({
      NETWORK_ENV: "production",
      ATTESTATION_SIGNER_KEY: `0x${"1".repeat(64)}`,
    } as unknown as NodeJS.ProcessEnv);
    expect(writer.mode).toBe("onchain");
    expect(writer).toBeInstanceOf(RealEasWriter);
  });

  it("defaults to staging so a missing NETWORK_ENV can never point at mainnet", () => {
    const config = readAttestationConfig({} as unknown as NodeJS.ProcessEnv);
    expect(config.networkEnv).toBe("staging");
    expect(config.onChain).toBe(false);
    expect(config.eas).toBe("");
  });

  it("targets the verified Celo mainnet EAS deployment in production", () => {
    const config = readAttestationConfig({
      NETWORK_ENV: "production",
      ATTESTATION_SIGNER_KEY: `0x${"1".repeat(64)}`,
    } as unknown as NodeJS.ProcessEnv);
    expect(config.chainId).toBe(42220);
    expect(config.eas).toBe("0x72E1d8ccf5299fb36fEfD8CC4394B8ef7e98Af92");
    expect(config.schemaRegistry).toBe("0x5ece93bE4BDCF293Ed61FA78698B594F2135AF34");
    expect(config.onChain).toBe(true);
  });
});

// --- currency / asset honesty ---------------------------------------------

describe("currency to asset mapping", () => {
  it("resolves a verified on-chain asset", () => {
    const usdc = assetAddressForCurrency("USDC");
    expect(usdc.onChain).toBe(true);
    expect(usdc.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("never invents an address for a currency it cannot verify", () => {
    for (const currency of ["NGN", "USD", "cNGN", "cUSD"]) {
      const resolved = assetAddressForCurrency(currency);
      expect(resolved.onChain).toBe(false);
      expect(resolved.address).toBe(OFF_CHAIN_ASSET);
    }
  });

  it("prefers the printer's expiry but always produces one", () => {
    const approvedAt = new Date("2026-09-01T09:00:00Z");
    const quoted = new Date("2026-09-01T15:00:00Z");
    expect(resolveValidUntil(quoted, approvedAt)).toEqual({
      validUntil: quoted,
      source: "QUOTE_EXPIRY",
    });
    // An already-passed quote expiry cannot become the commitment window.
    expect(resolveValidUntil(new Date("2026-08-01T00:00:00Z"), approvedAt).source).toBe(
      "DEFAULT_WINDOW",
    );
    expect(resolveValidUntil(null, approvedAt).source).toBe("DEFAULT_WINDOW");
  });
});
