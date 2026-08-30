import { createHash } from "node:crypto";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";

import type { PaymentConfig } from "./config";
import { feeToCappedAtomic } from "./config";
import { explorerTxUrl, isTransactionHash } from "./networks";
import type {
  ChallengeInput,
  PaymentAdapter,
  PaymentChallenge,
  SettleInput,
  SettleResult,
} from "./types";

/** The slice of `@x402/core`'s facilitator client this adapter needs. */
export interface FacilitatorClient {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

export type X402Config = Extract<PaymentConfig, { provider: "x402" }>;

const X402_VERSION = 2;
const DEFAULT_TIMEOUT_SECONDS = 120;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export class X402PaymentAdapter implements PaymentAdapter {
  readonly provider = "x402" as const;

  constructor(
    private readonly cfg: X402Config,
    private readonly facilitator: FacilitatorClient,
  ) {}

  isConfigured(): boolean {
    return true;
  }

  describe() {
    return {
      provider: "x402" as const,
      available: true,
      network: this.cfg.network,
      networkLabel: this.cfg.networkLabel,
      asset: this.cfg.asset.symbol,
      maxFeeUsd: this.cfg.maxFeeUsd,
      attributionConfigured: this.cfg.attributionTag !== null,
    };
  }

  private requirements(input: ChallengeInput): PaymentRequirements {
    return {
      scheme: "exact",
      // cfg.network is a CAIP-2 id from CELO_X402_NETWORKS (e.g. "eip155:42220").
      network: this.cfg.network as `${string}:${string}`,
      asset: this.cfg.asset.address,
      // Server-enforced cap: the ONLY amount ever advertised is <= $0.05.
      amount: feeToCappedAtomic(input.requestedFeeUsd, this.cfg.asset),
      payTo: input.payTo,
      maxTimeoutSeconds: input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
      extra: {
        ...this.cfg.asset.extra,
        ...(this.cfg.attributionTag ? { reference: this.cfg.attributionTag } : {}),
      },
    };
  }

  buildChallenge(input: ChallengeInput): PaymentChallenge {
    const requirements = this.requirements(input);
    const paymentRequired = {
      x402Version: X402_VERSION,
      error: "payment required for the quote information service",
      resource: { url: input.resourceUrl, method: input.method },
      accepts: [requirements],
    };
    return {
      status: 402,
      paymentRequired,
      header: {
        name: "X-PAYMENT-REQUIRED",
        value: encodePaymentRequiredHeader(paymentRequired as never),
      },
      amountAtomic: requirements.amount,
      assetSymbol: this.cfg.asset.symbol,
      network: this.cfg.network,
    };
  }

  authorizationKey(xPaymentHeader: string): string | null {
    const payload = this.decode(xPaymentHeader);
    return payload ? this.keyFor(payload) : null;
  }

  private decode(xPaymentHeader: string): PaymentPayload | null {
    try {
      return decodePaymentSignatureHeader(xPaymentHeader);
    } catch {
      return null;
    }
  }

  /** One-way hash of the signed authorisation — safe to persist, unique per authorisation. */
  private keyFor(payload: PaymentPayload): string {
    return createHash("sha256")
      .update(`x402|${this.cfg.network}|${stableStringify(payload.payload)}`)
      .digest("hex");
  }

  async settle(input: SettleInput): Promise<SettleResult> {
    const payload = this.decode(input.xPaymentHeader);
    if (!payload) {
      return {
        status: "FAILED",
        provider: "x402",
        code: "INVALID_PAYMENT_HEADER",
        reason: "The X-PAYMENT header could not be decoded.",
        authorizationKey: null,
      };
    }

    const authorizationKey = this.keyFor(payload);
    const requirements = this.requirements(input.challenge);

    // What the client claims it is paying against must match this route's
    // canonical requirements — this is the server-side spending cap.
    const claimed = payload.accepted;
    const mismatch =
      !claimed ||
      claimed.amount !== requirements.amount ||
      claimed.asset?.toLowerCase() !== requirements.asset.toLowerCase() ||
      claimed.network !== requirements.network ||
      claimed.payTo?.toLowerCase() !== requirements.payTo.toLowerCase();
    if (mismatch) {
      return {
        status: "FAILED",
        provider: "x402",
        code: "REQUIREMENTS_MISMATCH",
        reason:
          "The presented payment does not match this route's requirements or exceeds the cap.",
        authorizationKey,
      };
    }

    let verify: VerifyResponse;
    try {
      verify = await this.facilitator.verify(payload, requirements);
    } catch {
      return {
        status: "FAILED",
        provider: "x402",
        code: "VERIFY_REQUEST_FAILED",
        reason: "The facilitator verification request failed.",
        authorizationKey,
      };
    }
    if (!verify.isValid) {
      return {
        status: "FAILED",
        provider: "x402",
        code: "VERIFICATION_FAILED",
        reason: verify.invalidReason ?? "The payment authorisation is not valid.",
        authorizationKey,
      };
    }

    let settled: SettleResponse;
    try {
      settled = await this.facilitator.settle(payload, requirements);
    } catch {
      // A settle timeout is an indeterminate outcome — treat as failed, never
      // fabricate a transaction hash.
      return {
        status: "FAILED",
        provider: "x402",
        code: "SETTLE_REQUEST_FAILED",
        reason: "The facilitator settlement request failed or timed out.",
        authorizationKey,
      };
    }
    if (!settled.success || !isTransactionHash(settled.transaction)) {
      return {
        status: "FAILED",
        provider: "x402",
        code: "SETTLEMENT_FAILED",
        reason: settled.errorReason ?? "Settlement did not confirm on-chain.",
        authorizationKey,
      };
    }

    return {
      status: "SETTLED",
      provider: "x402",
      txHash: settled.transaction,
      network: settled.network ?? this.cfg.network,
      assetSymbol: this.cfg.asset.symbol,
      amountAtomic: settled.amount ?? requirements.amount,
      payer: settled.payer ?? verify.payer ?? "",
      payee: requirements.payTo,
      authorizationKey,
      explorerUrl: explorerTxUrl(settled.network ?? this.cfg.network, settled.transaction),
      attributionTag: this.cfg.attributionTag,
      verification: {
        verifiedBy: this.cfg.facilitatorUrl,
        verify: { isValid: verify.isValid, payer: verify.payer ?? null },
        settle: {
          success: settled.success,
          transaction: settled.transaction,
          network: settled.network ?? this.cfg.network,
          payer: settled.payer ?? null,
          amount: settled.amount ?? null,
        },
        recordedAt: new Date().toISOString(),
      },
      responseHeader: {
        name: "X-PAYMENT-RESPONSE",
        value: encodePaymentResponseHeader(settled),
      },
    };
  }
}
