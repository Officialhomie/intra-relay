// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { commitments } from "@/lib/db/schema";
import { submitQuote } from "@/features/quotes/service";
import { createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";
import { attestCommitment } from "@/features/commitments/service";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { MockEasWriter } from "@/features/attestation/writer";

import { requestHandoverSignature, submitHandoverSignature } from "./handover-service";
import { findHandoverAttestationByTaskId } from "./handover-repository";

/**
 * Two-party handover attestation (ADR-018, milestone 9). Runs entirely on a
 * MockEasWriter and viem's local signing — no network. The merchant's
 * "wallet" is a throwaway local key whose address is set as the business's
 * payout address (M9 §22: deterministic, network tests kept separate).
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "buyer-session-handover-1";
const MERCHANT_KEY = `0x${"5".repeat(64)}` as Hex;
const merchant = privateKeyToAccount(MERCHANT_KEY);

/** Approved task + a MOCK-attested commitment, ready for a handover. */
async function attestedCommitmentTask() {
  const { business, route } = await createActiveRoute(db, { payoutAddress: merchant.address });
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
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
  });
  await decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" });
  await attestCommitment(db, task.id, new MockEasWriter());

  const commitment = (await findCommitmentByTaskId(db, task.id))!;
  const [{ handoverCode }] = await db
    .select({ handoverCode: commitments.handoverCode })
    .from(commitments)
    .where(eq(commitments.taskId, task.id));

  return { task, manageToken: business.manageToken, commitment, code: handoverCode };
}

describe("handover attestation — genuine merchant signature (M9 §2, §6)", () => {
  it("completes: correct code -> merchant signs -> attested", async () => {
    const { task, manageToken, code } = await attestedCommitmentTask();

    const request = await requestHandoverSignature(db, task.id, {
      manageToken,
      presentedCode: code,
    });
    expect(request.status).toBe("PENDING_SIGNATURE");
    expect(request.typedData.domain.name).toBe("EAS");
    expect(request.typedData.message.attester.toLowerCase()).toBe(merchant.address.toLowerCase());

    const signature = await merchant.signTypedData(request.typedData);
    const result = await submitHandoverSignature(db, task.id, { manageToken, signature });

    expect(result.wrote).toBe(true);
    expect(result.row.status).toBe("ATTESTED");
    expect(result.row.attestationUid).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.mode).toBe("mock");
  });

  it("rejects a wrong code without creating a row (AC — no probing)", async () => {
    const { task, manageToken } = await attestedCommitmentTask();
    await expect(
      requestHandoverSignature(db, task.id, { manageToken, presentedCode: "WRONGCOD" }),
    ).rejects.toMatchObject({ code: "HANDOVER_CODE_MISMATCH" });
    expect(await findHandoverAttestationByTaskId(db, task.id)).toBeNull();
  });

  it("refuses without the business's manage token", async () => {
    const { task, code } = await attestedCommitmentTask();
    await expect(
      requestHandoverSignature(db, task.id, { manageToken: null, presentedCode: code }),
    ).rejects.toMatchObject({ code: "HANDOVER_AUTH_REQUIRED" });
  });

  it("refuses until the commitment itself is attested", async () => {
    const { business, route } = await createActiveRoute(db, { payoutAddress: merchant.address });
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, SESSION);
    await submitQuote(db, route.id, { taskId: task.id, amountMin: 20000, turnaround: "same day" });
    await decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" });
    // commitment exists but is PENDING_ATTESTATION — not attested
    const [{ handoverCode }] = await db
      .select({ handoverCode: commitments.handoverCode })
      .from(commitments)
      .where(eq(commitments.taskId, task.id));

    await expect(
      requestHandoverSignature(db, task.id, {
        manageToken: business.manageToken,
        presentedCode: handoverCode,
      }),
    ).rejects.toMatchObject({ code: "COMMITMENT_NOT_ATTESTED" });
  });

  it("rejects a signature from the wrong key and marks the row failed", async () => {
    const { task, manageToken, code } = await attestedCommitmentTask();
    const request = await requestHandoverSignature(db, task.id, {
      manageToken,
      presentedCode: code,
    });

    const impostor = privateKeyToAccount(`0x${"9".repeat(64)}` as Hex);
    const badSignature = await impostor.signTypedData(request.typedData);

    await expect(
      submitHandoverSignature(db, task.id, { manageToken, signature: badSignature }),
    ).rejects.toMatchObject({ code: "SIGNATURE_DOES_NOT_MATCH_PROVIDER" });

    const row = await findHandoverAttestationByTaskId(db, task.id);
    expect(row?.status).toBe("ATTESTATION_FAILED");
  });

  it("is idempotent: a repeat presentation returns the same pending request", async () => {
    const { task, manageToken, code } = await attestedCommitmentTask();
    const a = await requestHandoverSignature(db, task.id, { manageToken, presentedCode: code });
    const b = await requestHandoverSignature(db, task.id, { manageToken, presentedCode: code });
    expect(b.typedData.message.nonce).toBe(a.typedData.message.nonce);
    expect(b.deadline).toBe(a.deadline);
  });

  it("refuses a fresh presentation once the handover is already attested", async () => {
    const { task, manageToken, code } = await attestedCommitmentTask();
    const request = await requestHandoverSignature(db, task.id, {
      manageToken,
      presentedCode: code,
    });
    const signature = await merchant.signTypedData(request.typedData);
    await submitHandoverSignature(db, task.id, { manageToken, signature });

    await expect(
      requestHandoverSignature(db, task.id, { manageToken, presentedCode: code }),
    ).rejects.toMatchObject({ code: "HANDOVER_ALREADY_ATTESTED" });
  });

  it("rejects a signature submitted after its deadline", async () => {
    const { task, manageToken, code } = await attestedCommitmentTask();
    const t0 = new Date();
    const request = await requestHandoverSignature(
      db,
      task.id,
      { manageToken, presentedCode: code },
      new MockEasWriter(),
      t0,
    );
    const signature = await merchant.signTypedData(request.typedData);
    const later = new Date(t0.getTime() + 20 * 60 * 1000); // past the 10-minute window

    await expect(
      submitHandoverSignature(db, task.id, { manageToken, signature }, new MockEasWriter(), later),
    ).rejects.toMatchObject({ code: "HANDOVER_SIGNATURE_EXPIRED" });
  });

  it("a second submit after success returns the stored result, relaying nothing new", async () => {
    const { task, manageToken, code } = await attestedCommitmentTask();
    const request = await requestHandoverSignature(db, task.id, {
      manageToken,
      presentedCode: code,
    });
    const signature = await merchant.signTypedData(request.typedData);

    const first = await submitHandoverSignature(db, task.id, { manageToken, signature });
    const second = await submitHandoverSignature(db, task.id, { manageToken, signature });

    expect(first.wrote).toBe(true);
    expect(second.wrote).toBe(false);
    expect(second.row.attestationUid).toBe(first.row.attestationUid);
  });
});
