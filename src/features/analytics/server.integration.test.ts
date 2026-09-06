// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { auditEvents } from "@/lib/db/schema";
import { createTask, submitTask } from "@/features/tasks/service";
import { submitQuote } from "@/features/quotes/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";
import { eq } from "drizzle-orm";

// The Amplitude arm is stubbed to THROW — the product must not notice (§4, §41).
vi.mock("./forward", () => ({
  forwardToAmplitude: vi.fn(() => {
    throw new Error("amplitude forward exploded");
  }),
}));

import { forwardToAmplitude } from "./forward";
import { forwardServerAnalyticsEvent } from "./server";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  vi.clearAllMocks();
});
afterEach(async () => {
  await close();
});

describe("forwardServerAnalyticsEvent (M9.5 §29)", () => {
  it("schedules the forward and never throws, even when it explodes", () => {
    const schedule = vi.fn((fn: () => void) => fn());
    expect(() =>
      forwardServerAnalyticsEvent(
        { event: "request_received", actorKey: "biz-1", role: "business" },
        schedule,
      ),
    ).not.toThrow();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(forwardToAmplitude).toHaveBeenCalledTimes(1);
  });
});

describe("analytics failure isolation (M9.5 §4, §52)", () => {
  it("a buyer request still submits when the analytics forward throws", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, "session-analytics-1", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });

    const submitted = await submitTask(db, task.id, "session-analytics-1");
    expect(submitted.status).toBe("AWAITING_QUOTE");

    const events = await db.select().from(auditEvents).where(eq(auditEvents.taskId, task.id));
    const types = events.map((e) => e.type);
    expect(types).toContain("task.submitted");
    expect(types).toContain("task.awaiting_quote");
  });

  it("a business quote still submits when the analytics forward throws", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, "session-analytics-2", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, "session-analytics-2");

    const quote = await submitQuote(db, route.id, {
      taskId: task.id,
      amountMin: 15000,
      turnaround: "Same day",
    });
    expect(quote).toBeTruthy();
  });
});
