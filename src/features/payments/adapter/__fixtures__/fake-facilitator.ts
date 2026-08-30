import { encodePaymentSignatureHeader } from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";

import type { X402Config } from "../x402";
import type { FacilitatorClient } from "../x402";

import settleFail from "./settle-fail.json";
import settleSuccess from "./settle-success.json";
import verifyInvalid from "./verify-invalid.json";
import verifyValid from "./verify-valid.json";

const strip = <T extends Record<string, unknown>>(o: T) => {
  const { _note, ...rest } = o as T & { _note?: string };
  void _note;
  return rest;
};

export const VERIFY_VALID = strip(verifyValid) as VerifyResponse;
export const VERIFY_INVALID = strip(verifyInvalid) as VerifyResponse;
export const SETTLE_SUCCESS = strip(settleSuccess) as SettleResponse;
export const SETTLE_FAIL = strip(settleFail) as SettleResponse;

export const X402_TEST_CONFIG: X402Config = {
  provider: "x402",
  network: "eip155:42220",
  networkLabel: "Celo Mainnet",
  facilitatorUrl: "https://api.x402.celo.org",
  asset: {
    symbol: "USDC",
    address: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    extra: { name: "USDC", version: "2" },
  },
  apiKey: "test-metering-key",
  attributionTag: null,
  maxFeeUsd: 0.05,
};

/** Build a signed-looking X-PAYMENT header whose `accepted` matches a $fee requirement. */
export function buildXPaymentHeader(opts: {
  payTo: string;
  amountAtomic?: string;
  nonce?: string;
}): string {
  const amount = opts.amountAtomic ?? "20000"; // $0.02
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: "eip155:42220",
    asset: X402_TEST_CONFIG.asset.address,
    amount,
    payTo: opts.payTo,
    maxTimeoutSeconds: 120,
    extra: { name: "USDC", version: "2" },
  };
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted: requirements,
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: opts.payTo,
        value: amount,
        validAfter: "0",
        validBefore: "99999999999",
        nonce: opts.nonce ?? `0x${"2".repeat(64)}`,
      },
    },
  };
  return encodePaymentSignatureHeader(payload);
}

export interface FakeFacilitatorOptions {
  verify?: VerifyResponse | (() => Promise<VerifyResponse>);
  settle?: SettleResponse | (() => Promise<SettleResponse>);
  verifyThrows?: boolean;
  settleThrows?: boolean;
}

/** A `FacilitatorClient` that returns fixtures and counts calls. Never touches the network. */
export class FakeFacilitator implements FacilitatorClient {
  verifyCalls = 0;
  settleCalls = 0;

  constructor(private readonly opts: FakeFacilitatorOptions = {}) {}

  async verify(): Promise<VerifyResponse> {
    this.verifyCalls += 1;
    if (this.opts.verifyThrows) throw new Error("facilitator unreachable");
    const v = this.opts.verify ?? VERIFY_VALID;
    return typeof v === "function" ? v() : v;
  }

  async settle(): Promise<SettleResponse> {
    this.settleCalls += 1;
    if (this.opts.settleThrows) throw new Error("facilitator timeout");
    const s = this.opts.settle ?? SETTLE_SUCCESS;
    return typeof s === "function" ? s() : s;
  }
}
