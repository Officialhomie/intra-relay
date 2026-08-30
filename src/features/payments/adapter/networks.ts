/**
 * Official Celo x402 facilitator configuration.
 *
 * Verified against https://docs.celo.org/build-on-celo/build-with-ai/x402 and
 * the live `GET /supported` on 2026-08-30. Do not edit these values without
 * re-checking the source — endpoint hosts, CAIP-2 ids, and token contract
 * addresses are load-bearing (a wrong address silently sends funds nowhere).
 *
 * This module is pure public data and is safe to import anywhere.
 */

export interface X402Asset {
  symbol: "USDC" | "USDT";
  /** ERC-20 contract address on the network. */
  address: string;
  decimals: number;
  /** EIP-712 domain — MUST match the token contract or signature verification fails. */
  extra: { name: string; version: string };
}

export interface X402Network {
  /** CAIP-2 network id, e.g. "eip155:42220". */
  id: string;
  label: string;
  /** Facilitator payment API base (NOT the dashboard at x402.celo.org). */
  facilitatorUrl: string;
  /** `${base}${txHash}` → a block-explorer transaction page. */
  explorerTxBase: string;
  assets: Record<string, X402Asset>;
}

export const CELO_X402_NETWORKS: Record<string, X402Network> = {
  "eip155:42220": {
    id: "eip155:42220",
    label: "Celo Mainnet",
    facilitatorUrl: "https://api.x402.celo.org",
    explorerTxBase: "https://celoscan.io/tx/",
    assets: {
      USDC: {
        symbol: "USDC",
        address: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
        decimals: 6,
        extra: { name: "USDC", version: "2" },
      },
      USDT: {
        symbol: "USDT",
        address: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e",
        decimals: 6,
        // USDT has no on-chain version(); its EIP-712 domain is name/version below.
        extra: { name: "Tether USD", version: "1" },
      },
    },
  },
  "eip155:11142220": {
    id: "eip155:11142220",
    label: "Celo Sepolia",
    facilitatorUrl: "https://api.x402.sepolia.celo.org",
    explorerTxBase: "https://celo-sepolia.blockscout.com/tx/",
    assets: {
      USDC: {
        symbol: "USDC",
        address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
        decimals: 6,
        extra: { name: "USDC", version: "2" },
      },
    },
  },
};

export const X402_DEFAULT_NETWORK = "eip155:42220";
export const X402_DEFAULT_ASSET = "USDC";

/** `${base}${txHash}` for the given CAIP-2 network, or null if unknown. */
export function explorerTxUrl(network: string | null | undefined, txHash: string): string | null {
  if (!network) return null;
  const entry = CELO_X402_NETWORKS[network];
  if (!entry) return null;
  return `${entry.explorerTxBase}${txHash}`;
}

export function isTransactionHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
