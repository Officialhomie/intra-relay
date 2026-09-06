// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { confirmPickup, markReadyForPickup } from "@/features/proofline/service";
import { declineRequest, submitQuote } from "@/features/quotes/service";
import { confirmHandoff, createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import { getBusinessValueSummary, nextActionForBusiness, valueHeadline } from "./value";

/**
 * "What is this doing for my business?" (milestone 5 §7, §18).
 *
 * Every figure here has to come from rows that exist. A dashboard that invents
 * a number is worse than an empty one, because the whole proposition on this
 * side is a history the business can point at.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "session-value-1";

async function requestOn(routeId: string, session = SESSION) {
  const task = await createTask(db, session, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId },
  });
  await submitTask(db, task.id, session);
  return task.id;
}

describe("a business with nothing yet", () => {
  it("reports zeroes and no invented figures", async () => {
    const { business } = await createActiveRoute(db);
    const summary = await getBusinessValueSummary(db, business.id);

    expect(summary.hasActivity).toBe(false);
    expect(summary.requestsReceived).toBe(0);
    expect(summary.jobsCompleted).toBe(0);
    // Rates and times are null, not zero — there is nothing to average.
    expect(summary.medianResponseMinutes).toBeNull();
    expect(summary.responseRate).toBeNull();
    expect(summary.winRate).toBeNull();
  });

  it("still explains what would put something here", async () => {
    const { business } = await createActiveRoute(db);
    const summary = await getBusinessValueSummary(db, business.id);
    const headline = valueHeadline(summary);

    expect(headline).toMatch(/nothing has come in yet/i);
    expect(headline).toMatch(/request lands here/i);
    // No promises the product cannot keep (§8).
    expect(headline).not.toMatch(/more customers|grow|guaranteed/i);
  });
});

describe("counting real activity", () => {
  it("counts requests, prices sent and declines separately", async () => {
    const { business, route } = await createActiveRoute(db);
    const quoted = await requestOn(route.id);
    const declined = await requestOn(route.id, "session-value-2");
    await requestOn(route.id, "session-value-3"); // left unanswered

    await submitQuote(db, route.id, {
      taskId: quoted,
      amountMin: 15_000,
      turnaround: "same day",
      fixed: true,
    });
    await declineRequest(db, route.id, { taskId: declined, reason: "Out of card stock" });

    const summary = await getBusinessValueSummary(db, business.id);
    expect(summary.requestsReceived).toBe(3);
    expect(summary.quotesSent).toBe(1);
    expect(summary.requestsDeclined).toBe(1);
    expect(summary.responseRate).toBe(33);
  });

  it("counts a job as agreed only once the customer accepts", async () => {
    const { business, route } = await createActiveRoute(db);
    const taskId = await requestOn(route.id);
    await submitQuote(db, route.id, {
      taskId,
      amountMin: 15_000,
      turnaround: "same day",
      fixed: true,
    });

    expect((await getBusinessValueSummary(db, business.id)).jobsAgreed).toBe(0);
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });

    const summary = await getBusinessValueSummary(db, business.id);
    expect(summary.jobsAgreed).toBe(1);
    expect(summary.winRate).toBe(100);
    // Agreed is not completed — the customer has not collected anything yet.
    expect(summary.jobsCompleted).toBe(0);
  });

  it("counts a job as completed only once the customer confirms collection", async () => {
    const { business, route } = await createActiveRoute(db);
    const taskId = await requestOn(route.id);
    await submitQuote(db, route.id, {
      taskId,
      amountMin: 15_000,
      turnaround: "same day",
      fixed: true,
    });
    await decideOnQuote(db, taskId, SESSION, { decision: "ACCEPT" });
    await confirmHandoff(db, taskId, SESSION);

    // Handed off, and the printer says it is ready — still not completed. The
    // business does not get to mark its own job done.
    const { pickupCode } = await markReadyForPickup(db, taskId, {
      manageToken: business.manageToken,
    });
    expect((await getBusinessValueSummary(db, business.id)).jobsCompleted).toBe(0);

    // Only the customer confirming they collected it counts.
    await confirmPickup(db, taskId, { sessionId: SESSION, code: pickupCode });

    const summary = await getBusinessValueSummary(db, business.id);
    expect(summary.jobsCompleted).toBe(1);
    expect(valueHeadline(summary)).toMatch(/first job is complete/i);
  });

  it("reports a reply time only once a price has actually been sent", async () => {
    const { business, route } = await createActiveRoute(db);
    expect((await getBusinessValueSummary(db, business.id)).medianResponseMinutes).toBeNull();

    const taskId = await requestOn(route.id);
    await submitQuote(db, route.id, {
      taskId,
      amountMin: 15_000,
      turnaround: "same day",
      fixed: true,
    });

    const summary = await getBusinessValueSummary(db, business.id);
    expect(summary.medianResponseMinutes).not.toBeNull();
    expect(summary.medianResponseMinutes).toBeGreaterThanOrEqual(0);
  });

  it("ignores another business's activity", async () => {
    const { route } = await createActiveRoute(db);
    const other = await createActiveRoute(db, { businessName: "Someone Else Prints" });

    const taskId = await requestOn(route.id);
    await submitQuote(db, route.id, {
      taskId,
      amountMin: 15_000,
      turnaround: "same day",
      fixed: true,
    });

    const summary = await getBusinessValueSummary(db, other.business.id);
    expect(summary.requestsReceived).toBe(0);
    expect(summary.hasActivity).toBe(false);
  });
});

describe("what the business is told", () => {
  it("marks the first completed job as a milestone, honestly", () => {
    const headline = valueHeadline({
      requestsReceived: 1,
      quotesSent: 1,
      requestsDeclined: 0,
      jobsAgreed: 1,
      jobsCompleted: 1,
      medianResponseMinutes: 8,
      responseRate: 100,
      winRate: 100,
      hasActivity: true,
    });
    expect(headline).toMatch(/first job is complete/i);
    expect(headline).toMatch(/history/i);
    // A record of what happened — never a claim about quality (§17).
    expect(headline).not.toMatch(/proves|guarantee|quality|rating/i);
  });

  it("points at the thing actually waiting on them", () => {
    const summary = {
      requestsReceived: 2,
      quotesSent: 0,
      requestsDeclined: 0,
      jobsAgreed: 0,
      jobsCompleted: 0,
      medianResponseMinutes: null,
      responseRate: 0,
      winRate: null,
      hasActivity: true,
    };
    expect(nextActionForBusiness({ summary, waitingForQuote: 2, awaitingHandover: 0 })).toMatch(
      /send a price for 2 requests/i,
    );
    expect(nextActionForBusiness({ summary, waitingForQuote: 0, awaitingHandover: 1 })).toMatch(
      /mark 1 order ready/i,
    );
    expect(nextActionForBusiness({ summary, waitingForQuote: 0, awaitingHandover: 0 })).toBeNull();
  });
});
