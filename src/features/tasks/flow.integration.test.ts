// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { changeRouteStatus } from "@/features/routes/service";
import { submitQuote } from "@/features/quotes/service";
import { COMPLETE_FLYER_BRIEF, TEST_OPERATOR, createActiveRoute } from "@/test-support/factories";

import { createTask, getTaskView, submitTask } from "./service";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "session-abcdefgh";

describe("buyer task flow (F-TASK, F-REC, F-PAY)", () => {
  it("runs create → submit → quote → HANDOFF_READY with an honest UNAVAILABLE payment", async () => {
    const { route } = await createActiveRoute(db);

    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    expect(task.status).toBe("DRAFT");

    const submitted = await submitTask(db, task.id, SESSION);
    expect(submitted.status).toBe("AWAITING_QUOTE");
    expect(submitted.submittedAt).not.toBeNull();

    const viewAfterSubmit = await getTaskView(db, task.id, SESSION);
    expect(viewAfterSubmit.payments).toHaveLength(1);
    expect(viewAfterSubmit.payments[0].status).toBe("UNAVAILABLE"); // FR-PAY-004
    expect(viewAfterSubmit.payments[0].txHash).toBeNull();

    const { task: handoff, recommendation } = await submitQuote(db, route.id, {
      taskId: task.id,
      amountMin: 15000,
      amountMax: 18000,
      turnaround: "same day",
      confidence: "medium",
    });
    expect(handoff.status).toBe("HANDOFF_READY");
    expect(recommendation.orderMessage).toMatch(/flyer printing/i);
    expect(recommendation.orderMessage).toMatch(/Please confirm/i);

    const finalView = await getTaskView(db, task.id, SESSION);
    expect(finalView.quotes).toHaveLength(1);
    expect(finalView.timeline.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "task.created",
        "task.submitted",
        "task.awaiting_quote",
        "payment.unavailable",
        "quote.received",
        "recommendation.created",
        "task.handoff_ready",
      ]),
    );
  });

  it("blocks submission of an incomplete brief with the missing fields (AC-TASK-002)", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: { size: "A5" },
      route: { routeId: route.id },
    });
    await expect(submitTask(db, task.id, SESSION)).rejects.toMatchObject({
      code: "INCOMPLETE_BRIEF",
      status: 422,
    });
    const view = await getTaskView(db, task.id, SESSION);
    expect(view.task.status).toBe("DRAFT");
  });

  it("fails the task when its route is paused before submission (AC-ROUTE-002)", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });

    await expect(submitTask(db, task.id, SESSION)).rejects.toMatchObject({
      code: "ROUTE_UNAVAILABLE",
    });

    const view = await getTaskView(db, task.id, SESSION);
    expect(view.task.status).toBe("FAILED");
    expect(view.task.failureReason).toBe("ROUTE_UNAVAILABLE");
    expect(view.payments).toHaveLength(0); // no payment request was issued
  });

  it("refuses to bind a task to a non-ACTIVE route at creation", async () => {
    const { route } = await createActiveRoute(db);
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });
    await expect(
      createTask(db, SESSION, {
        structuredInput: COMPLETE_FLYER_BRIEF,
        route: { routeId: route.id },
      }),
    ).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE" });
  });

  it("scopes task reads to the owning session", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await expect(getTaskView(db, task.id, "someone-elses-session")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("rejects a second quote for the same task", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, SESSION);
    await submitQuote(db, route.id, { taskId: task.id, amountMin: 15000, turnaround: "same day" });
    await expect(
      submitQuote(db, route.id, { taskId: task.id, amountMin: 16000, turnaround: "next day" }),
    ).rejects.toMatchObject({ code: "QUOTE_EXISTS" });
  });

  it("rejects a quote on a paused route without creating anything", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, SESSION, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, SESSION);
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });
    await expect(
      submitQuote(db, route.id, { taskId: task.id, amountMin: 15000, turnaround: "same day" }),
    ).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE" });

    const view = await getTaskView(db, task.id, SESSION);
    expect(view.quotes).toHaveLength(0);
  });
});
