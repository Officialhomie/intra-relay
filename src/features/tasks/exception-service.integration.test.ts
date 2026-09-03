// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { listTaskAuditEvents } from "@/features/audit/repository";
import { createTask, decideOnQuote, getTaskView, submitTask } from "@/features/tasks/service";
import { listTaskQuotes } from "@/features/tasks/repository";
import { submitQuote } from "@/features/quotes/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import {
  buyerCancelsAfterAgreement,
  providerCannotFulfil,
  reportHandoverFailure,
  withdrawAsProvider,
} from "./exception-service";

/**
 * Exception transitions (milestone 6 §18). Each closes an order with a semantic
 * reason, closes any live quote as WITHDRAWN without editing its terms, writes
 * an audit event, and never touches a payment row.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "session-exceptions-1";

async function recommendedOrder() {
  const { route } = await createActiveRoute(db);
  const task = await createTask(db, SESSION, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, SESSION);
  await submitQuote(db, route.id, {
    taskId: task.id,
    amountMin: 15_000,
    turnaround: "same day",
    fixed: true,
    confidence: "high",
  });
  return { route, taskId: task.id };
}

async function agreedOrder() {
  const { route, taskId } = await recommendedOrder();
  await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
  return { route, taskId };
}

describe("the provider withdraws", () => {
  it("before the buyer agrees: closes the request, quote WITHDRAWN, terms untouched", async () => {
    const { route, taskId } = await recommendedOrder();
    const [before] = await listTaskQuotes(db, taskId);

    const out = await withdrawAsProvider(db, route.id, { taskId, reason: "Costs went up." });
    expect(out.reason).toBe("PROVIDER_WITHDREW");

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("FAILED");
    expect(view.exception?.reason).toBe("PROVIDER_WITHDREW");
    expect(view.exception?.origin).toBe("provider");

    const [after] = await listTaskQuotes(db, taskId);
    expect(after.status).toBe("WITHDRAWN");
    expect(after.amountMin).toBe(before.amountMin); // never edited
  });

  it("after the buyer agrees: a different semantic reason, still no money claim", async () => {
    const { route, taskId } = await agreedOrder();
    const out = await withdrawAsProvider(db, route.id, { taskId, reason: "Machine broke." });
    expect(out.reason).toBe("PROVIDER_WITHDREW_AFTER_AGREEMENT");

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.exception?.moneyNote).not.toMatch(/refunded|we charged|charged your|reimburse/i);
    // The exception path writes no new payment rows and settles nothing.
    expect(view.payments.filter((p) => p.status === "SETTLED")).toHaveLength(0);
  });
});

describe("the provider cannot fulfil an agreed job", () => {
  it("only applies to an agreed order", async () => {
    const { route, taskId } = await recommendedOrder();
    await expect(
      providerCannotFulfil(db, route.id, { taskId, reason: "Out of stock." }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_AGREED" });
  });

  it("closes the agreed order and audits it", async () => {
    const { route, taskId } = await agreedOrder();
    await providerCannotFulfil(db, route.id, { taskId, reason: "Out of card stock." });

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("FAILED");
    expect(view.exception?.reason).toBe("PROVIDER_CANNOT_FULFILL");

    const types = (await listTaskAuditEvents(db, taskId)).map((e) => e.type);
    expect(types).toContain("task.failed");
  });
});

describe("the buyer cancels an agreed order", () => {
  it("is refused before agreement (decline the recommendation instead)", async () => {
    const { taskId } = await recommendedOrder();
    await expect(buyerCancelsAfterAgreement(db, taskId, SESSION, {})).rejects.toMatchObject({
      code: "ORDER_NOT_CANCELLABLE_HERE",
    });
  });

  it("closes an agreed order with its own reason, keeping the note", async () => {
    const { taskId } = await agreedOrder();
    const out = await buyerCancelsAfterAgreement(db, taskId, SESSION, {
      reason: "No longer needed.",
    });
    expect(out.reason).toBe("BUYER_CANCELLED_AFTER_AGREEMENT");

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("CANCELLED");
    expect(view.exception?.origin).toBe("buyer");
    expect(view.task.buyerDeclineReason).toBe("No longer needed.");
  });

  it("only the owning session can cancel", async () => {
    const { taskId } = await agreedOrder();
    await expect(buyerCancelsAfterAgreement(db, taskId, "someone-else", {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("the handover fails", () => {
  it("closes the order without marking it complete or writing a completion record", async () => {
    const { taskId } = await agreedOrder();
    const out = await reportHandoverFailure(db, taskId, SESSION, { detail: "Code didn't match." });
    expect(out.reason).toBe("HANDOVER_FAILED");

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("FAILED");
    expect(view.exception?.reason).toBe("HANDOVER_FAILED");
    expect(view.exception?.whatNext.toLowerCase()).toContain("not marked complete");
    expect(view.proofline).toBeNull();
  });
});
