import { describe, expect, it } from "vitest";

import { nextAction, type NextActionView } from "./next-action";

/**
 * The task page's single "what now" decision (frontend audit D1). Priority
 * order, not new business logic — every input here is a field `TaskPage`
 * already reads off `getTaskView`.
 */

const BASE: NextActionView = {
  task: { status: "AWAITING_QUOTE" },
  recommendation: null,
  priceChange: null,
  exception: null,
  handoffConfirmedAt: null,
  proofline: null,
};

describe("nextAction", () => {
  it("defaults to waiting while there is no quote yet", () => {
    expect(nextAction(BASE).kind).toBe("waiting");
  });

  it("surfaces the decision once a quote is recommended", () => {
    const view: NextActionView = {
      ...BASE,
      task: { status: "RECOMMENDED" },
      recommendation: { rationale: "x" },
    };
    expect(nextAction(view).kind).toBe("decision");
  });

  it("does not surface a decision without a recommendation payload", () => {
    const view: NextActionView = { ...BASE, task: { status: "RECOMMENDED" } };
    expect(nextAction(view).kind).toBe("waiting");
  });

  it("surfaces closing the order once handed off but not yet confirmed", () => {
    const view: NextActionView = { ...BASE, task: { status: "HANDOFF_READY" } };
    expect(nextAction(view).kind).toBe("close_order");
  });

  it("surfaces completion once the buyer confirmed the handoff", () => {
    const view: NextActionView = {
      ...BASE,
      task: { status: "HANDOFF_READY" },
      handoffConfirmedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(nextAction(view).kind).toBe("completed");
  });

  it("surfaces the pickup confirmation once the business marks it ready", () => {
    const view: NextActionView = {
      ...BASE,
      task: { status: "HANDOFF_READY" },
      handoffConfirmedAt: "2026-01-01T00:00:00.000Z",
      proofline: { evidenceStatus: "MERCHANT_MARKED_READY" },
    };
    expect(nextAction(view).kind).toBe("pickup");
  });

  it("treats a settled pickup as completed, not a pending pickup", () => {
    const view: NextActionView = {
      ...BASE,
      task: { status: "HANDOFF_READY" },
      handoffConfirmedAt: "2026-01-01T00:00:00.000Z",
      proofline: { evidenceStatus: "BUYER_CONFIRMED_PICKUP" },
    };
    expect(nextAction(view).kind).toBe("completed");
  });

  it("puts an exception ahead of everything except a price change", () => {
    const view: NextActionView = {
      ...BASE,
      task: { status: "CANCELLED" },
      exception: { reason: "BUYER_CANCELLED" },
    };
    expect(nextAction(view).kind).toBe("exception");
  });

  it("a pending price change outranks an exception", () => {
    const view: NextActionView = {
      ...BASE,
      task: { status: "HANDOFF_READY" },
      exception: { reason: "BUYER_CANCELLED" },
      priceChange: { direction: "higher" },
    };
    expect(nextAction(view).kind).toBe("price_change");
  });

  it("a pending price change outranks closing the order", () => {
    const view: NextActionView = {
      ...BASE,
      task: { status: "HANDOFF_READY" },
      priceChange: { direction: "higher" },
    };
    expect(nextAction(view).kind).toBe("price_change");
  });
});
