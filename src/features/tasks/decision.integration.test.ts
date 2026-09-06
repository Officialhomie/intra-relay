// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { createFeedback } from "@/features/feedback/service";
import { declineRequest, submitQuote, type SubmitQuoteRequest } from "@/features/quotes/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import { confirmHandoff, createTask, decideOnQuote, getTaskView, submitTask } from "./service";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "session-abcdefgh";

async function taskWithQuote(quoteOverrides: Partial<Omit<SubmitQuoteRequest, "taskId">> = {}) {
  const { route } = await createActiveRoute(db);
  const task = await createTask(db, SESSION, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, SESSION);
  await submitQuote(db, route.id, {
    taskId: task.id,
    amountMin: 15000,
    deliveryCharge: 1500,
    turnaround: "same day",
    confidence: "medium",
    fixed: true,
    ...quoteOverrides,
  });
  return { route, taskId: task.id };
}

describe("buyer quote decision (PRD §8, FR-REC-004)", () => {
  it("stops at RECOMMENDED with the supplier contact still hidden", async () => {
    const { taskId } = await taskWithQuote();
    const view = await getTaskView(db, taskId, SESSION);

    expect(view.task.status).toBe("RECOMMENDED");
    expect(view.task.quotedAt).not.toBeNull();
    expect(view.task.buyerDecision).toBeNull();
    expect(view.supplier?.name).toBe("Campus Prints NG");
    expect(view.supplier?.contactChannelValue).toBeNull(); // not until the buyer accepts
    expect(view.recommendation?.verificationNote).toMatch(/not independently/i);
    expect(view.recommendation?.normalized.totalMin).toBe(16500);
    expect(view.recommendation?.orderMessage).toMatch(/Please confirm/i);
  });

  it("accept → HANDOFF_READY, contact revealed, three distinct events", async () => {
    const { taskId } = await taskWithQuote();

    const result = await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    expect(result.decision).toBe("ACCEPTED");

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("HANDOFF_READY");
    expect(view.task.buyerDecision).toBe("ACCEPTED");
    expect(view.task.buyerDecidedAt).not.toBeNull();
    expect(view.task.closedAt).not.toBeNull();
    expect(view.supplier?.contactChannelValue).toBe("+2348012345678");

    const types = view.timeline.map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(["quote.received", "task.buyer_accepted", "task.handoff_ready"]),
    );
    expect(types).not.toContain("task.handoff_confirmed");

    const confirmed = await confirmHandoff(db, taskId, SESSION);
    expect(confirmed.handoffConfirmedAt).toBeTruthy();
    const after = await getTaskView(db, taskId, SESSION);
    expect(after.task.handoffConfirmedAt).not.toBeNull();
    expect(after.handoffConfirmedAt).toBe(confirmed.handoffConfirmedAt);
    expect(after.timeline.map((e) => e.type)).toContain("task.handoff_confirmed");

    const fb = await createFeedback(db, { taskId, useful: true });
    expect(fb.useful).toBe(true);
  });

  it("confirmHandoff is idempotent", async () => {
    const { taskId } = await taskWithQuote();
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    const first = await confirmHandoff(db, taskId, SESSION);
    const second = await confirmHandoff(db, taskId, SESSION);
    expect(second.handoffConfirmedAt).toBe(first.handoffConfirmedAt);
    const view = await getTaskView(db, taskId, SESSION);
    expect(view.timeline.filter((e) => e.type === "task.handoff_confirmed")).toHaveLength(1);
  });

  it("decline with a reason → CANCELLED, reason stored, feedback allowed", async () => {
    const { taskId } = await taskWithQuote();

    await decideOnQuote(db, taskId, SESSION, {
      decision: "DECLINE",
      reason: "Found a cheaper printer on campus",
    });

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("CANCELLED");
    expect(view.task.buyerDecision).toBe("DECLINED");
    expect(view.task.buyerDeclineReason).toBe("Found a cheaper printer on campus");
    expect(view.task.closedAt).not.toBeNull();
    expect(view.supplier?.contactChannelValue).toBeNull();
    const declineEvent = view.timeline.find((e) => e.type === "task.buyer_declined");
    expect(declineEvent?.data).toEqual({ hasReason: true }); // reason is not in the audit payload

    const fb = await createFeedback(db, { taskId, useful: false, comment: "too slow" });
    expect(fb.useful).toBe(false);
  });

  it("decline without a reason still works", async () => {
    const { taskId } = await taskWithQuote();
    await decideOnQuote(db, taskId, SESSION, { decision: "DECLINE" });
    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("CANCELLED");
    expect(view.task.buyerDeclineReason).toBeNull();
  });

  it("accepting an expired quote is allowed, marks it EXPIRED, and adds the caveat", async () => {
    const { taskId } = await taskWithQuote({ expiresAt: new Date(Date.now() - 60_000) });

    const result = await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    expect(result.quoteExpired).toBe(true);

    const view = await getTaskView(db, taskId, SESSION);
    expect(view.task.status).toBe("HANDOFF_READY");
    expect(view.quotes[0].status).toBe("EXPIRED");
    expect(view.quotes[0].effectiveStatus).toBe("EXPIRED");
    expect(view.recommendation?.quoteExpired).toBe(true);
    expect(view.recommendation?.orderMessage).toMatch(/passed its stated expiry/i);
    expect(view.timeline.map((e) => e.type)).toContain("quote.expired");
  });

  it("shows a not-yet-expired quote as RECEIVED (read-time effective status)", async () => {
    const { taskId } = await taskWithQuote({ expiresAt: new Date(Date.now() + 60 * 60_000) });
    expect((await getTaskView(db, taskId, SESSION)).quotes[0].effectiveStatus).toBe("RECEIVED");
  });

  it("rejects a decision before a quote exists", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, SESSION);

    await expect(decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" })).rejects.toMatchObject(
      { code: "TASK_NOT_AWAITING_DECISION", status: 409 },
    );
  });

  it("rejects a decision from a different session", async () => {
    const { taskId } = await taskWithQuote();
    await expect(
      decideOnQuote(db, taskId, "not-your-session", { decision: "ACCEPT" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("rejects a second decision once the task has left RECOMMENDED", async () => {
    const { taskId } = await taskWithQuote();
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    await expect(decideOnQuote(db, taskId, SESSION, { decision: "DECLINE" })).rejects.toMatchObject(
      { code: "TASK_NOT_AWAITING_DECISION" },
    );
  });

  it("a supplier decline never reaches the buyer-decision path", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, SESSION);
    await declineRequest(db, route.id, { taskId: task.id, reason: "Out of our delivery area" });

    const view = await getTaskView(db, task.id, SESSION);
    expect(view.task.status).toBe("FAILED");
    expect(view.task.failureReason).toBe("SUPPLIER_DECLINED");
    expect(view.task.quotedAt).not.toBeNull();
    expect(view.task.closedAt).not.toBeNull();
    await expect(decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" })).rejects.toMatchObject(
      { code: "TASK_NOT_AWAITING_DECISION" },
    );
  });
});
