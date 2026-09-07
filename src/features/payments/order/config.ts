/**
 * SERVER-ONLY. Buyer order-payment (MiniPay) configuration (M10.5, ADR-023).
 *
 * The MiniPay payment path is only live in `NETWORK_ENV=production` — the same
 * gate the attestation layer uses. There is NO secret here: settlement
 * verification is a public Celo RPC read (`getTransactionReceipt`), and the
 * buyer's wallet holds and signs everything. The NGN→USD reference rate comes
 * from a configured public FX endpoint (`NGN_USD_RATE_URL`); with none set the
 * path degrades to "unavailable", never a guessed rate (M10.5 §16).
 */
import { CELO_MAINNET_CHAIN_ID } from "@/features/attestation/chain";
import { DEFAULT_CELO_RPC_URL } from "@/features/attestation/config";
import { CELO_X402_NETWORKS, X402_DEFAULT_NETWORK } from "@/features/payments/adapter/networks";

/** open.er-api.com is a free, keyless FX API. `rates.NGN` on the USD base = NGN per 1 USD. */
export const DEFAULT_NGN_USD_RATE_URL = "https://open.er-api.com/v6/latest/USD";

export interface OrderPaymentConfig {
  /** True only when a real MiniPay settlement + verification can happen. */
  enabled: boolean;
  chainId: number;
  /** Settlement asset for the pilot. USDC only (M10.5 decision). */
  asset: "USDC";
  assetAddress: string;
  assetDecimals: number;
  rpcUrl: string;
  rateUrl: string;
  /** Why the path is / isn't available — surfaced in the UI and the evidence trace. */
  reason: string;
}

export function readOrderPaymentConfig(env: NodeJS.ProcessEnv = process.env): OrderPaymentConfig {
  const usdc = CELO_X402_NETWORKS[X402_DEFAULT_NETWORK]?.assets.USDC;
  const rpcUrl = env.RPC_URL?.trim() || DEFAULT_CELO_RPC_URL;
  const rateUrl = env.NGN_USD_RATE_URL?.trim() || DEFAULT_NGN_USD_RATE_URL;
  const networkEnv = env.NETWORK_ENV?.trim().toLowerCase();

  const base = {
    chainId: CELO_MAINNET_CHAIN_ID,
    asset: "USDC" as const,
    assetAddress: usdc?.address ?? "",
    assetDecimals: usdc?.decimals ?? 6,
    rpcUrl,
    rateUrl,
  };

  if (!usdc) {
    return {
      ...base,
      enabled: false,
      reason: "USDC is not configured for Celo mainnet in payments/adapter/networks.ts.",
    };
  }
  if (networkEnv !== "production") {
    return {
      ...base,
      enabled: false,
      reason:
        "NETWORK_ENV is not production. On-chain buyer payment through MiniPay is disabled; " +
        "the WhatsApp handoff is the only order path.",
    };
  }

  return {
    ...base,
    enabled: true,
    reason:
      "NETWORK_ENV is production. Buyer order payment through MiniPay is live on Celo mainnet.",
  };
}
