import { HTTPFacilitatorClient } from "@x402/core/http";

import { readPaymentConfig } from "./config";
import { NoopPaymentAdapter } from "./noop";
import type { PaymentAdapter } from "./types";
import { X402PaymentAdapter } from "./x402";

export type { PaymentAdapter, PaymentChallenge, SettleInput, SettleResult } from "./types";
export { PAYMENT_MAX_FEE_USD } from "./config";
export { explorerTxUrl } from "./networks";

let cached: PaymentAdapter | null = null;

/** Memoised, environment-driven payment adapter. Server-only. */
export function getPaymentAdapter(): PaymentAdapter {
  if (cached) return cached;

  const config = readPaymentConfig();
  if (config.provider === "x402") {
    const client = new HTTPFacilitatorClient({
      url: config.facilitatorUrl,
      // The metering key gates `/settle`. Sent to the facilitator only,
      // never to the browser or a buyer.
      createAuthHeaders: async () => {
        const headers = { "X-API-Key": config.apiKey };
        return { verify: headers, settle: headers, supported: headers };
      },
    });
    cached = new X402PaymentAdapter(config, client);
  } else {
    cached = new NoopPaymentAdapter(config.reason);
  }
  return cached;
}

/** Test hook. */
export function __setPaymentAdapter(adapter: PaymentAdapter | null): void {
  cached = adapter;
}
