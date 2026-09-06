// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { changeRouteStatus } from "@/features/routes/service";
import { submitQuote } from "@/features/quotes/service";
import { confirmHandoff, createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, TEST_OPERATOR, createActiveRoute } from "@/test-support/factories";

import { buildPilotScorecard } from "./scorecard";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const NO_ENV = {} as NodeJS.ProcessEnv;

describe("buildPilotScorecard (M9.5 §50)", () => {
  it("is all zeros on an empty database — never an estimate", async () => {
    const card = await buildPilotScorecard(db, new Date(), NO_ENV);
    expect(card.buyer.meaningfulRequests).toBe(0);
    expect(card.buyer.successfulWorkflows).toBe(0);
    expect(card.business.onboarded).toBe(0);
    expect(card.business.quotesSent).toBe(0);
    expect(card.notifications.workflowsResumed).toBe(0);
    expect(card.retention.firstWorkflowCompleted).toBe(0);
  });

  it("counts a real request → quote → acceptance → handoff from audit rows", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, "session-sc-1", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, "session-sc-1");
    await submitQuote(db, route.id, { taskId: task.id, amountMin: 12000, turnaround: "Next day" });
    await decideOnQuote(db, task.id, "session-sc-1", { decision: "ACCEPT" });
    await confirmHandoff(db, task.id, "session-sc-1");
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });

    const card = await buildPilotScorecard(db, new Date(), NO_ENV);

    expect(card.business.onboarded).toBe(1);
    expect(card.business.requestsReceived).toBe(1);
    expect(card.business.quotesSent).toBe(1);
    expect(card.business.quotesAccepted).toBe(1);
    expect(card.buyer.meaningfulRequests).toBe(1);
    expect(card.buyer.successfulWorkflows).toBe(1);
    expect(card.retention.firstWorkflowCompleted).toBe(1);
  });

  it("excludes [DEMO SEED] activity via the real-scope snapshot", async () => {
    const { route } = await createActiveRoute(db, { businessName: "[DEMO SEED] Test Printer" });
    const task = await createTask(db, "session-sc-demo", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, "session-sc-demo");

    const card = await buildPilotScorecard(db, new Date(), NO_ENV);
    expect(card.business.onboarded).toBe(0);
    expect(card.buyer.meaningfulRequests).toBe(0);
  });
});
