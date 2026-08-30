/**
 * Provider-neutral payment adapter contract.
 *
 * The rest of Intra depends only on this file — never on `@x402/core` or any
 * facilitator SDK directly. A future cPay adapter implements the same interface.
 */

export type PaymentProvider = "x402" | "cpay" | "none";

export interface ChallengeInput {
  /** Absolute URL of the paid resource (the quote endpoint). */
  resourceUrl: string;
  method: string;
  /** Payee — the route's public payout address. Never a secret. */
  payTo: string;
  /** Requested query-service fee in USD. Always capped server-side. */
  requestedFeeUsd: number;
  timeoutSeconds?: number;
}

export interface PaymentChallenge {
  status: 402;
  /** Fields an x402-aware agent needs, matching the x402 `PaymentRequired` shape. */
  paymentRequired: {
    x402Version: number;
    error: string;
    resource: { url: string; method: string };
    accepts: Array<{
      scheme: string;
      network: string;
      asset: string;
      amount: string;
      payTo: string;
      maxTimeoutSeconds: number;
      extra: Record<string, unknown>;
    }>;
  };
  /** Optional response header advertising the requirements (base64). */
  header?: { name: string; value: string };
  amountAtomic: string;
  assetSymbol: string;
  network: string;
}

export interface SettleInput {
  /** Raw `X-PAYMENT` header value (base64 payment payload). */
  xPaymentHeader: string;
  challenge: ChallengeInput;
}

export interface SettledResult {
  status: "SETTLED";
  provider: PaymentProvider;
  /** Confirmed mainnet/testnet transaction hash (0x + 64 hex). */
  txHash: string;
  network: string;
  assetSymbol: string;
  amountAtomic: string;
  payer: string;
  payee: string;
  /** Deterministic idempotency key derived from the signed authorization. */
  authorizationKey: string;
  explorerUrl: string | null;
  attributionTag: string | null;
  /** Persisted verbatim on the receipt. Contains NO signature or authorisation payload. */
  verification: Record<string, unknown>;
  /** `X-PAYMENT-RESPONSE` header value (base64). */
  responseHeader: { name: string; value: string };
}

export interface FailedResult {
  status: "FAILED";
  provider: PaymentProvider;
  code: string;
  reason: string;
  authorizationKey: string | null;
}

export interface UnavailableResult {
  status: "UNAVAILABLE";
  provider: PaymentProvider;
  reason: string;
}

export type SettleResult = SettledResult | FailedResult | UnavailableResult;

export interface PaymentAdapter {
  readonly provider: PaymentProvider;
  isConfigured(): boolean;
  /** Public summary for the capability document. Never includes a secret. */
  describe(): {
    provider: PaymentProvider;
    available: boolean;
    network?: string;
    networkLabel?: string;
    asset?: string;
    maxFeeUsd?: number;
    attributionConfigured?: boolean;
    reason?: string;
  };
  buildChallenge(input: ChallengeInput): PaymentChallenge | UnavailableResult;
  /** Deterministic idempotency key for a presented `X-PAYMENT`, or null if undecodable. */
  authorizationKey(xPaymentHeader: string): string | null;
  /** 402 → X-PAYMENT → official verify → official settle. Never fabricates a receipt. */
  settle(input: SettleInput): Promise<SettleResult>;
}
