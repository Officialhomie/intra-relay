import { HTTPFacilitatorClient } from "@x402/core/http";

import { readPaymentConfig } from "./config";
import { NoopPaymentAdapter } from "./noop";
import type { PaymentAdapter } from "./types";
import { X402PaymentAdapter } from "./x402";

export type { PaymentAdapter, PaymentChallenge, SettleInput, SettleResult } from "./types";
export { PAYMENT_MAX_FEE_USD } from "./config";
export { explorerTxUrl } from "./networks";

let cached: PaymentAdapter | null = null;
let loggedConfigProblem = false;

/** Server-side, once per process. Never includes the API key. */
function logConfigProblemOnce(message: string): void {
  if (loggedConfigProblem) return;
  loggedConfigProblem = true;
  console.error(`[payments] x402 configuration problem: ${message}`);
}

/**
 * Memoised, environment-driven payment adapter. Server-only.
 *
 * A malformed `X402_*` env degrades to the explicit-unavailable adapter (logged
 * once) — it never throws, so the quote workflow (free routes, capability doc,
 * buyer submit) keeps working. Only paid routes see `503`.
 */
export function getPaymentAdapter(): PaymentAdapter {
  if (cached) return cached;

  let config;
  try {
    config = readPaymentConfig();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The x402 configuration is invalid.";
    logConfigProblemOnce(reason);
    cached = new NoopPaymentAdapter(reason, { code: "CONFIG_ERROR" });
    return cached;
  }

  if (config.provider === "x402") {
    if (config.configWarning) logConfigProblemOnce(config.configWarning);
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
    cached = new NoopPaymentAdapter(config.reason, { code: config.code });
  }
  return cached;
}

/** Test hook. */
export function __setPaymentAdapter(adapter: PaymentAdapter | null): void {
  cached = adapter;
  loggedConfigProblem = false;
}
