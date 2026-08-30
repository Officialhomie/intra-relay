/**
 * SERVER-ONLY. Reads x402 / cPay payment configuration from the environment.
 * `X402_API_KEY` is a metering secret — it must never be `NEXT_PUBLIC_*` and
 * must never be logged.
 */
import {
  CELO_X402_NETWORKS,
  X402_DEFAULT_ASSET,
  X402_DEFAULT_NETWORK,
  type X402Asset,
} from "./networks";

/** Hard product rule: an agent may never be charged more than this per task. */
export const PAYMENT_MAX_FEE_USD = 0.05;

export type PaymentConfig =
  | { provider: "none"; reason: string }
  | {
      provider: "x402";
      network: string;
      networkLabel: string;
      facilitatorUrl: string;
      asset: X402Asset;
      apiKey: string;
      /** ERC-8021 attribution tag from official hackathon registration, or null. */
      attributionTag: string | null;
      maxFeeUsd: number;
    };

export function readPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const apiKey = env.X402_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "none",
      reason: "No x402 / cPay facilitator is configured (X402_API_KEY is unset).",
    };
  }

  const network = env.X402_NETWORK?.trim() || X402_DEFAULT_NETWORK;
  const networkEntry = CELO_X402_NETWORKS[network];
  if (!networkEntry) {
    throw new Error(
      `X402_NETWORK="${network}" is not a supported Celo x402 network. ` +
        `Use one of: ${Object.keys(CELO_X402_NETWORKS).join(", ")}.`,
    );
  }

  const assetSymbol = env.X402_ASSET?.trim() || X402_DEFAULT_ASSET;
  const asset = networkEntry.assets[assetSymbol];
  if (!asset) {
    throw new Error(
      `X402_ASSET="${assetSymbol}" is not settleable on ${networkEntry.label}. ` +
        `Use one of: ${Object.keys(networkEntry.assets).join(", ")}.`,
    );
  }

  const attributionTag = env.X402_ATTRIBUTION_TAG?.trim() || null;

  return {
    provider: "x402",
    network,
    networkLabel: networkEntry.label,
    facilitatorUrl: env.X402_FACILITATOR_URL?.trim() || networkEntry.facilitatorUrl,
    asset,
    apiKey,
    attributionTag,
    maxFeeUsd: PAYMENT_MAX_FEE_USD,
  };
}

/** Cap a USD fee at the task limit and convert to the asset's atomic units (a string). */
export function feeToCappedAtomic(requestedFeeUsd: number, asset: X402Asset): string {
  const capped = Math.min(Math.max(requestedFeeUsd, 0), PAYMENT_MAX_FEE_USD);
  // Round to whole atomic units. 6-decimals: $0.02 -> 20000.
  const atomic = Math.round(capped * 10 ** asset.decimals);
  return BigInt(atomic).toString();
}
