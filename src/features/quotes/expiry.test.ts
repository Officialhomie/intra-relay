import { describe, expect, it } from "vitest";

import type { QuoteRow } from "@/lib/db/schema";

import { quoteEffectiveStatus, quoteIsExpired } from "./expiry";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const q = (over: Partial<QuoteRow>): Pick<QuoteRow, "status" | "expiresAt"> => ({
  status: "RECEIVED",
  expiresAt: null,
  ...over,
});

describe("quoteEffectiveStatus (BR-003)", () => {
  it("keeps RECEIVED when there is no expiry", () => {
    expect(quoteEffectiveStatus(q({}), NOW)).toBe("RECEIVED");
  });

  it("keeps RECEIVED while the expiry is in the future", () => {
    expect(quoteEffectiveStatus(q({ expiresAt: new Date("2026-09-01T00:00:00Z") }), NOW)).toBe(
      "RECEIVED",
    );
  });

  it("reports EXPIRED once the expiry has passed", () => {
    expect(quoteEffectiveStatus(q({ expiresAt: new Date("2026-08-30T11:59:59Z") }), NOW)).toBe(
      "EXPIRED",
    );
    expect(quoteIsExpired(q({ expiresAt: new Date("2026-08-01T00:00:00Z") }), NOW)).toBe(true);
  });

  it("never overrides a DECLINED or already-EXPIRED status", () => {
    expect(quoteEffectiveStatus(q({ status: "DECLINED" }), NOW)).toBe("DECLINED");
    expect(quoteEffectiveStatus(q({ status: "EXPIRED" }), NOW)).toBe("EXPIRED");
  });
});
