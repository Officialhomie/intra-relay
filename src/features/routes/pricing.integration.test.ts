// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { eq } from "drizzle-orm";

import { createTestDatabase } from "@/lib/db/testing";
import { auditEvents } from "@/lib/db/schema";
import { findRouteById } from "@/features/routes/repository";
import { acceptedOffer } from "@/features/quotes/revision";
import { submitQuote } from "@/features/quotes/service";
import { createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { listTaskQuotes } from "@/features/tasks/repository";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import { updatePublishedPricing } from "./pricing";

/**
 * Business self-service pricing (milestone 6 §19).
 *
 * A business can change the price it publishes. That must never reach back and
 * change a price a customer has already agreed — historical quotes are
 * immutable (milestone 5 §6, §22 "Can an accepted quote be silently changed?
 * The answer must be NO").
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "session-pricing-19";

describe("editing the published price", () => {
  it("updates the route's published figure and stamps priceUpdatedAt", async () => {
    const { route } = await createActiveRoute(db);
    const result = await updatePublishedPricing(db, route.id, {
      model: "STARTING_FROM",
      amount: 18_000,
      unit: "per 100",
    });

    expect(result.pricing).toEqual({
      model: "STARTING_FROM",
      published: { amount: 18_000, currency: route.quoteCurrency, unit: "per 100" },
    });
    expect(result.summary).toMatch(/from/i);

    const fresh = await findRouteById(db, route.id);
    expect(fresh?.priceAmount).toBe("18000.00");
    expect(fresh?.priceUnit).toBe("per 100");
    expect(fresh?.priceUpdatedAt).not.toBeNull();
  });

  it("can move a service to priced-per-job, clearing the published amount", async () => {
    const { route } = await createActiveRoute(db);
    await updatePublishedPricing(db, route.id, {
      model: "STARTING_FROM",
      amount: 12_000,
      unit: null,
    });
    await updatePublishedPricing(db, route.id, {
      model: "QUOTE_REQUIRED",
      amount: null,
      unit: null,
    });

    const fresh = await findRouteById(db, route.id);
    expect(fresh?.pricingModel).toBe("QUOTE_REQUIRED");
    expect(fresh?.priceAmount).toBeNull();
    expect(fresh?.priceUnit).toBeNull();
  });

  it("rejects a zero or missing amount for a priced model", async () => {
    const { route } = await createActiveRoute(db);
    await expect(
      updatePublishedPricing(db, route.id, { model: "FIXED", amount: 0, unit: null }),
    ).rejects.toMatchObject({ code: "INVALID_PRICING" });
    await expect(
      updatePublishedPricing(db, route.id, { model: "FIXED", amount: null, unit: null }),
    ).rejects.toMatchObject({ code: "INVALID_PRICING" });
  });

  it("writes an audit event with the before and after", async () => {
    const { business, route } = await createActiveRoute(db);
    await updatePublishedPricing(db, route.id, { model: "FIXED", amount: 55, unit: "per page" });
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.businessId, business.id));
    const entry = events.find((e) => e.type === "route.pricing_updated");
    expect(entry?.data).toMatchObject({
      to: { model: "FIXED", amount: "55.00", unit: "per page" },
    });
  });
});

describe("a quote a customer already agreed is untouched", () => {
  it("keeps its exact amount after the business changes its published price", async () => {
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
    await decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" });

    const agreedBefore = acceptedOffer(await listTaskQuotes(db, task.id))!;

    await updatePublishedPricing(db, route.id, {
      model: "STARTING_FROM",
      amount: 25_000,
      unit: "per 100",
    });

    const agreedAfter = acceptedOffer(await listTaskQuotes(db, task.id))!;
    expect(agreedAfter.id).toBe(agreedBefore.id);
    expect(agreedAfter.amountMin).toBe("15000.00");
    expect(agreedAfter.acceptedAt).toEqual(agreedBefore.acceptedAt);
    expect(agreedAfter.status).toBe(agreedBefore.status);
  });
});
