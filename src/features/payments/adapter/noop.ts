import type { PaymentAdapter, SettleResult, UnavailableResult } from "./types";

/**
 * The adapter used when no facilitator is configured — or when the x402
 * configuration is invalid. Every path is `UNAVAILABLE` (503): never a
 * fabricated 402, receipt, or transaction (ADR-004). The quote workflow still
 * runs; only paid routes are affected.
 */
export class NoopPaymentAdapter implements PaymentAdapter {
  readonly provider = "none" as const;

  private readonly code: string;

  constructor(
    private readonly reason: string,
    opts: { code?: string } = {},
  ) {
    this.code = opts.code ?? "NOT_CONFIGURED";
  }

  isConfigured(): boolean {
    return false;
  }

  describe() {
    return {
      provider: "none" as const,
      available: false,
      reason: this.reason,
      code: this.code,
    };
  }

  buildChallenge(): UnavailableResult {
    return { status: "UNAVAILABLE", provider: "none", reason: this.reason, code: this.code };
  }

  authorizationKey(): string | null {
    return null;
  }

  async settle(): Promise<SettleResult> {
    return { status: "UNAVAILABLE", provider: "none", reason: this.reason, code: this.code };
  }
}
