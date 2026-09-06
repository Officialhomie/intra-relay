import { describe, expect, it } from "vitest";

import {
  describeTaskException,
  PROVIDER_EXCEPTION_REASONS,
  type TaskExceptionReason,
} from "./exceptions";

/**
 * Exception-state copy (milestone 6 §18): every case answers what happened,
 * whether the buyer must act, and what happens next — in plain language, with
 * no internal status names and no invented financial outcome.
 */

const ALL_REASONS: TaskExceptionReason[] = [
  "SUPPLIER_DECLINED",
  "PROVIDER_WITHDREW",
  "PROVIDER_WITHDREW_AFTER_AGREEMENT",
  "PROVIDER_CANNOT_FULFILL",
  "HANDOVER_FAILED",
  "BUYER_CANCELLED",
  "BUYER_CANCELLED_AFTER_AGREEMENT",
  "ROUTE_UNAVAILABLE",
  "NO_VIABLE_OFFER",
];

describe("describeTaskException", () => {
  it("returns null for a live or cleanly handed-off order", () => {
    expect(describeTaskException({ status: "RECOMMENDED", failureReason: null })).toBeNull();
    expect(describeTaskException({ status: "HANDOFF_READY", failureReason: null })).toBeNull();
  });

  it("maps a buyer decline before agreement to BUYER_CANCELLED", () => {
    const view = describeTaskException({ status: "CANCELLED", failureReason: null });
    expect(view?.reason).toBe("BUYER_CANCELLED");
    expect(view?.origin).toBe("buyer");
  });

  it("maps a buyer cancel after agreement to its own reason", () => {
    const view = describeTaskException({
      status: "CANCELLED",
      failureReason: "BUYER_CANCELLED_AFTER_AGREEMENT",
    });
    expect(view?.reason).toBe("BUYER_CANCELLED_AFTER_AGREEMENT");
  });

  it("falls back to NO_VIABLE_OFFER for an unrecognised failure code", () => {
    expect(
      describeTaskException({ status: "FAILED", failureReason: "SOMETHING_NEW" })?.reason,
    ).toBe("NO_VIABLE_OFFER");
  });

  it("gives every reason the three answers, in plain language", () => {
    for (const reason of ALL_REASONS) {
      const status = reason.startsWith("BUYER_CANCELLED") ? "CANCELLED" : "FAILED";
      const failureReason = reason === "BUYER_CANCELLED" ? null : reason;
      const view = describeTaskException({ status, failureReason })!;
      expect(view.headline.length).toBeGreaterThan(8);
      expect(view.whatHappened.length).toBeGreaterThan(20);
      expect(view.whatNext.length).toBeGreaterThan(10);
      // no internal identifiers leak
      for (const field of [view.headline, view.whatHappened, view.whatNext, view.moneyNote]) {
        expect(field).not.toMatch(/[A-Z]{2,}_[A-Z]/);
        expect(field).not.toMatch(/HANDOFF_READY|RECOMMENDED|failureReason/);
      }
    }
  });

  it("never states a refund or a charge Intra did not make", () => {
    for (const reason of ALL_REASONS) {
      const status = reason.startsWith("BUYER_CANCELLED") ? "CANCELLED" : "FAILED";
      const view = describeTaskException({
        status,
        failureReason: reason === "BUYER_CANCELLED" ? null : reason,
      })!;
      expect(view.moneyNote).not.toMatch(/refund|we (?:charged|paid)|your card|reimburse/i);
    }
  });

  it("attributes provider-caused exceptions to the provider", () => {
    for (const reason of PROVIDER_EXCEPTION_REASONS) {
      expect(describeTaskException({ status: "FAILED", failureReason: reason })?.origin).toBe(
        "provider",
      );
    }
  });
});
