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
import { MockEasWriter } from "@/features/attestation/writer";
import {
  requestHandoverSignature,
  submitHandoverSignature,
} from "@/features/attestation/handover-service";
import { COMMITMENT_SCHEMA_UID, HANDOVER_SCHEMA_UID } from "@/features/attestation/schema";

import { buildTransactionTrace } from "./trace";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "buyer-session-evidence-1";
const merchant = privateKeyToAccount(`0x${"6".repeat(64)}` as Hex);

describe("transaction evidence trace (M9 §13, §14, §16)", () => {
  it("returns null for an unknown task", async () => {
    expect(await buildTransactionTrace(db, "does-not-exist")).toBeNull();
  });

  it("reconstructs one full transaction by taskId alone, with a consistency cross-check", async () => {
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

    const [{ handoverCode }] = await db
      .select({ handoverCode: commitments.handoverCode })
      .from(commitments)
      .where(eq(commitments.taskId, task.id));

    const request = await requestHandoverSignature(db, task.id, {
      manageToken: business.manageToken,
      presentedCode: handoverCode,
    });
    const signature = await merchant.signTypedData(request.typedData);
    await submitHandoverSignature(db, task.id, { manageToken: business.manageToken, signature });

    const trace = (await buildTransactionTrace(db, task.id))!;

    expect(trace.task.id).toBe(task.id);
    expect(trace.provider?.businessName).toBe(business.name);
    expect(trace.commitment?.schemaUid).toBe(COMMITMENT_SCHEMA_UID);
    expect(trace.handover?.schemaUid).toBe(HANDOVER_SCHEMA_UID);
    expect(trace.handover?.attesterAddress.toLowerCase()).toBe(merchant.address.toLowerCase());

    // Both attested (as mocks here), and the handover links to the commitment's UID.
    expect(trace.consistency.commitmentAttested).toBe(true);
    expect(trace.consistency.handoverAttested).toBe(true);
    expect(trace.consistency.handoverReferencesCommitment).toBe(true);
    expect(trace.consistency.anySimulated).toBe(true); // mock mode

    // Never leaks the secret material.
    const serialised = JSON.stringify(trace);
    expect(serialised).not.toContain(handoverCode);
    expect(serialised).not.toContain("revealedSalt");
    expect(serialised).not.toContain("signNonce");
  });
});
