// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { submitQuote } from "@/features/quotes/service";
import { confirmHandoff, createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

/**
 * Synthetic journey verification at the code level (M9.5 §44).
 *
 * Drives ONE real transaction through the deterministic services and asserts
 * the server-forwarded analytics events fire, in order, with opaque ids only
 * and no secrets. The Amplitude-UI half of §44/§45 is Victor's to verify.
 */

const captured: { event: string; userId: string | null; role: string; props?: unknown }[] = [];

vi.mock("./forward", () => ({
  forwardToAmplitude: vi.fn(async (events: typeof captured) => {
    for (const e of events) captured.push(e);
  }),
}));

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  captured.length = 0;
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

describe("synthetic transaction journey — server analytics arm", () => {
  it("emits business_ready → request_received → notification/attention, opaque ids only", async () => {
    const { route, business } = await createActiveRoute(db);

    const task = await createTask(db, "session-journey-1", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, "session-journey-1");
    await submitQuote(db, route.id, { taskId: task.id, amountMin: 14000, turnaround: "Same day" });
    await decideOnQuote(db, task.id, "session-journey-1", { decision: "ACCEPT" });
    await confirmHandoff(db, task.id, "session-journey-1");

    const events = captured.map((c) => c.event);
    expect(events).toContain("business_ready");
    expect(events).toContain("request_received");
    expect(events).toContain("notification_created");
    expect(events.indexOf("business_ready")).toBeLessThan(events.indexOf("request_received"));

    const requestReceived = captured.find((c) => c.event === "request_received");
    expect(requestReceived?.userId).toBe(business.id);
    expect(requestReceived?.role).toBe("business");

    // No conversation text, contact detail, token or handover secret anywhere.
    const blob = JSON.stringify(captured);
    expect(blob).not.toMatch(/UNILAG|whatsapp|manageToken|handoverCode/i);
  });
});
