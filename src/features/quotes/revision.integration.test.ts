// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { listTaskAuditEvents } from "@/features/audit/repository";
import { listTaskQuotes } from "@/features/tasks/repository";
import { createTask, decideOnQuote, getTaskView, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import {
  acceptedOffer,
  currentOffer,
  decideOnPriceChange,
  pendingChange,
  priceChangeView,
  reviseQuote,
} from "./revision";
import { submitQuote } from "./service";

/**
 * Quote integrity (milestone 5 §6, and the §22 criterion "Can an accepted quote
 * be silently changed? The answer must be NO").
 *
 * A business must be able to change its prices — that is a real commercial
 * need, not a bug. What must never happen is a change to terms a buyer has
 * already agreed to, without that buyer deciding on it.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "session-integrity-1";

async function quotedOrder(amount = 15_000) {
  const { route } = await createActiveRoute(db);
  const task = await createTask(db, SESSION, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, SESSION);
  await submitQuote(db, route.id, {
    taskId: task.id,
    amountMin: amount,
    turnaround: "same day",
    fixed: true,
    confidence: "high",
  });
  return { route, taskId: task.id };
}

const REVISION = {
  amountMin: 19_500,
  turnaround: "next day",
  fixed: true,
  reason: "Card stock went up this morning.",
};

// --- before acceptance ------------------------------------------------------

describe("a price change BEFORE the buyer accepts", () => {
  it("replaces the offer and leaves the original readable, never edited", async () => {
    const { route, taskId } = await quotedOrder(15_000);
    const [original] = await listTaskQuotes(db, taskId);

    const outcome = await reviseQuote(db, route.id, { taskId, ...REVISION });
    expect(outcome.kind).toBe("REPLACED");

    const quotes = await listTaskQuotes(db, taskId);
    expect(quotes).toHaveLength(2);

    // The row the buyer had seen is closed, not rewritten.
    const before = quotes.find((q) => q.id === original.id)!;
    expect(before.status).toBe("SUPERSEDED");
    expect(before.amountMin).toBe("15000.00");

    const now = currentOffer(quotes)!;
    expect(now.amountMin).toBe("19500.00");
    expect(now.revision).toBe(2);
    expect(now.supersedesQuoteId).toBe(original.id);
    expect(now.changeReason).toBe(REVISION.reason);
  });

  it("puts the new price in front of the buyer, with the reason", async () => {
    const { route, taskId } = await quotedOrder(15_000);
    await reviseQuote(db, route.id, { taskId, ...REVISION });

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("RECOMMENDED");
    expect(view.recommendation?.normalized.totalMin).toBe(19_500);
    expect(view.recommendation?.orderMessage).toContain("19500.00");
  });

  it("means a buyer who then accepts agrees to the NEW price, not the old one", async () => {
    const { route, taskId } = await quotedOrder(15_000);
    await reviseQuote(db, route.id, { taskId, ...REVISION });
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });

    const quotes = await listTaskQuotes(db, taskId);
    const agreed = acceptedOffer(quotes)!;
    expect(agreed.amountMin).toBe("19500.00");
    expect(agreed.acceptedAt).not.toBeNull();
    // The superseded row was never accepted.
    expect(quotes.find((q) => q.status === "SUPERSEDED")!.acceptedAt).toBeNull();
  });

  it("records the change as its own audited event", async () => {
    const { route, taskId } = await quotedOrder();
    await reviseQuote(db, route.id, { taskId, ...REVISION });
    const events = await listTaskAuditEvents(db, taskId);
    const revised = events.find((e) => e.type === "quote.revised");
    expect(revised).toBeDefined();
    expect(revised?.data).toMatchObject({ previousAmount: "15000.00", newAmount: "19500.00" });
  });
});

// --- after acceptance -------------------------------------------------------

describe("a price change AFTER the buyer accepts", () => {
  async function acceptedOrder() {
    const { route, taskId } = await quotedOrder(15_000);
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    return { route, taskId };
  }

  it("CANNOT silently change the agreed terms — it can only propose", async () => {
    const { route, taskId } = await acceptedOrder();
    const agreedBefore = acceptedOffer(await listTaskQuotes(db, taskId))!;

    const outcome = await reviseQuote(db, route.id, { taskId, ...REVISION });
    expect(outcome.kind).toBe("CHANGE_PROPOSED");

    const quotes = await listTaskQuotes(db, taskId);
    const agreedAfter = quotes.find((q) => q.id === agreedBefore.id)!;

    // Byte-for-byte the same commercial terms as the buyer agreed to.
    expect(agreedAfter.amountMin).toBe(agreedBefore.amountMin);
    expect(agreedAfter.currency).toBe(agreedBefore.currency);
    expect(agreedAfter.turnaround).toBe(agreedBefore.turnaround);
    expect(agreedAfter.expiresAt).toEqual(agreedBefore.expiresAt);
    expect(agreedAfter.acceptedAt).toEqual(agreedBefore.acceptedAt);
    expect(agreedAfter.status).toBe("RECEIVED");

    // The new price exists, but is explicitly NOT in force.
    const proposal = pendingChange(quotes)!;
    expect(proposal.status).toBe("PROPOSED");
    expect(proposal.amountMin).toBe("19500.00");
    expect(proposal.acceptedAt).toBeNull();
    expect(acceptedOffer(quotes)!.amountMin).toBe("15000.00");
  });

  it("refuses a second proposal while one is still waiting on the buyer", async () => {
    const { route, taskId } = await acceptedOrder();
    await reviseQuote(db, route.id, { taskId, ...REVISION });
    await expect(reviseQuote(db, route.id, { taskId, ...REVISION })).rejects.toMatchObject({
      code: "CHANGE_ALREADY_PENDING",
    });
  });

  it("keeps the agreed price when the buyer refuses the change", async () => {
    const { route, taskId } = await acceptedOrder();
    await reviseQuote(db, route.id, { taskId, ...REVISION });

    const result = await decideOnPriceChange(db, taskId, SESSION, { decision: "DECLINE" });
    expect(result.decision).toBe("DECLINED");
    expect(result.inForce.amountMin).toBe("15000.00");

    const quotes = await listTaskQuotes(db, taskId);
    expect(pendingChange(quotes)).toBeNull();
    expect(quotes.find((q) => q.amountMin === "19500.00")!.status).toBe("WITHDRAWN");
    expect(acceptedOffer(quotes)!.amountMin).toBe("15000.00");
  });

  it("moves to the new price only on the buyer's explicit acceptance", async () => {
    const { route, taskId } = await acceptedOrder();
    await reviseQuote(db, route.id, { taskId, ...REVISION });

    const result = await decideOnPriceChange(db, taskId, SESSION, { decision: "ACCEPT" });
    expect(result.decision).toBe("ACCEPTED");
    expect(result.inForce.amountMin).toBe("19500.00");
    expect(result.inForce.acceptedAt).not.toBeNull();

    const quotes = await listTaskQuotes(db, taskId);
    // The previously agreed row is closed as superseded — still readable, never edited.
    const previous = quotes.find((q) => q.amountMin === "15000.00")!;
    expect(previous.status).toBe("SUPERSEDED");
    expect(previous.amountMin).toBe("15000.00");
    expect(acceptedOffer(quotes)!.amountMin).toBe("19500.00");

    // The order message the buyer sends now carries the agreed new amount.
    const view = await getTaskView(db, taskId, SESSION);
    expect(view.recommendation?.orderMessage).toContain("19500.00");
    expect(view.recommendation?.orderMessage).not.toContain("15000.00");
  });

  it("lets only the buyer who owns the order decide on the change", async () => {
    const { route, taskId } = await acceptedOrder();
    await reviseQuote(db, route.id, { taskId, ...REVISION });
    await expect(
      decideOnPriceChange(db, taskId, "someone-else-session", { decision: "ACCEPT" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("audits both the proposal and the buyer's decision", async () => {
    const { route, taskId } = await acceptedOrder();
    await reviseQuote(db, route.id, { taskId, ...REVISION });
    await decideOnPriceChange(db, taskId, SESSION, { decision: "ACCEPT" });

    const types = (await listTaskAuditEvents(db, taskId)).map((e) => e.type);
    expect(types).toContain("quote.change_proposed");
    expect(types).toContain("quote.change_accepted");
  });
});

// --- guard rails ------------------------------------------------------------

describe("revision guard rails", () => {
  it("refuses to revise an order that was never quoted", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, SESSION);
    await expect(reviseQuote(db, route.id, { taskId: task.id, ...REVISION })).rejects.toMatchObject(
      { code: "NO_QUOTE_TO_REVISE" },
    );
  });

  it("refuses to revise a closed order", async () => {
    const { route, taskId } = await quotedOrder();
    await decideOnQuote(db, taskId, SESSION, { decision: "DECLINE" });
    await expect(reviseQuote(db, route.id, { taskId, ...REVISION })).rejects.toMatchObject({
      code: "ORDER_CLOSED",
    });
  });

  it("will not re-run the original decision once an order is agreed", async () => {
    const { route, taskId } = await quotedOrder();
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    await reviseQuote(db, route.id, { taskId, ...REVISION });

    // The only route to a different price is the change decision. The original
    // accept/decline endpoint is closed for an agreed order.
    await expect(decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" })).rejects.toMatchObject({
      code: "TASK_NOT_AWAITING_DECISION",
    });
  });

  it("rejects a decision when nothing was proposed", async () => {
    const { taskId } = await quotedOrder();
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    await expect(
      decideOnPriceChange(db, taskId, SESSION, { decision: "ACCEPT" }),
    ).rejects.toMatchObject({ code: "NO_PENDING_CHANGE" });
  });

  it("describes the change to the buyer in money, not in codes", async () => {
    const { route, taskId } = await quotedOrder(15_000);
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    await reviseQuote(db, route.id, { taskId, ...REVISION });

    const quotes = await listTaskQuotes(db, taskId);
    const view = priceChangeView(pendingChange(quotes)!, acceptedOffer(quotes)!);
    expect(view).toMatchObject({
      agreedAmount: "15000.00",
      proposedAmount: "19500.00",
      direction: "higher",
      difference: "4500.00",
      reason: REVISION.reason,
    });
  });
});
