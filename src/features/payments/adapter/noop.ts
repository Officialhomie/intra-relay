import type { PaymentAdapter, SettleResult, UnavailableResult } from "./types";

/**
 * The adapter used when no facilitator is configured. Every path is
 * `UNAVAILABLE` — never a fabricated 402, receipt, or transaction (ADR-004).
 */
export class NoopPaymentAdapter implements PaymentAdapter {
  readonly provider = "none" as const;

  constructor(private readonly reason: string) {}

  isConfigured(): boolean {
    return false;
  }

  describe() {
    return { provider: "none" as const, available: false, reason: this.reason };
  }

  buildChallenge(): UnavailableResult {
    return { status: "UNAVAILABLE", provider: "none", reason: this.reason };
  }

  authorizationKey(): string | null {
    return null;
  }

  async settle(): Promise<SettleResult> {
    return { status: "UNAVAILABLE", provider: "none", reason: this.reason };
  }
}
