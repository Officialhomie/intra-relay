/**
 * SERVER-ONLY. Chain environment for the attestation layer (ADR-018).
 *
 * Verified by direct `eth_getCode` probe on 2026-09-01:
 *
 *   contract                     Celo mainnet (42220)   Celo Sepolia (11142220)
 *   EAS                          deployed               NO CODE
 *   SchemaRegistry               deployed               NO CODE
 *   ERC-8004 Identity            deployed               NO CODE
 *   ERC-8004 Reputation          deployed               NO CODE
 *
 * The `eas-contracts` repo also ships a `celo` deployment and no `celo-sepolia`
 * one. So EAS and ERC-8004 are **mainnet-only on Celo**: there is no testnet to
 * develop against, and staging therefore runs a clearly-labelled local mock
 * (CLAUDE.md §4.4). x402 is different — it has a real Sepolia facilitator, so
 * the payment adapter keeps its own network config and is NOT duplicated here.
 *
 * Never present mock output as a real attestation (CLAUDE.md §4.1).
 */
import {
  CELO_MAINNET_CAIP2,
  CELO_MAINNET_CHAIN_ID,
  EAS_CONTRACTS,
  ERC8004_CONTRACTS,
} from "./chain";

export const CELO_SEPOLIA_CHAIN_ID = 11142220;
export const CELO_SEPOLIA_CAIP2 = "eip155:11142220";

export type NetworkEnv = "staging" | "production";

/**
 * How attestation writes are performed.
 *   `celo-mainnet` — real EAS / ERC-8004 calls. The only mode whose output may
 *                    be presented as genuine.
 *   `mock`         — in-process, deterministic, never on any chain. Every record
 *                    it produces is flagged `simulated: true`.
 */
export type AttestationMode = "celo-mainnet" | "mock";

export interface AttestationConfig {
  networkEnv: NetworkEnv;
  mode: AttestationMode;
  chainId: number;
  caip2: string;
  rpcUrl: string;
  eas: string;
  schemaRegistry: string;
  erc8004Identity: string;
  erc8004Reputation: string;
  /** True only for `celo-mainnet`. Gate every "this is real" claim on it. */
  onChain: boolean;
  /** Why the mode is what it is — surfaced in the UI and the agent trace. */
  reason: string;
}

export const DEFAULT_CELO_RPC_URL = "https://forno.celo.org";

function readNetworkEnv(env: NodeJS.ProcessEnv): NetworkEnv {
  const raw = env.NETWORK_ENV?.trim().toLowerCase();
  if (raw === "production") return "production";
  if (raw === "staging" || !raw) return "staging";
  throw new Error(`NETWORK_ENV="${raw}" is invalid. Use "staging" or "production".`);
}

/**
 * Production requires an explicit signer. Without one we degrade to `mock`
 * rather than pretending: a missing key must never silently become a fabricated
 * attestation.
 */
export function readAttestationConfig(env: NodeJS.ProcessEnv = process.env): AttestationConfig {
  const networkEnv = readNetworkEnv(env);
  const hasSigner = Boolean(env.ATTESTATION_SIGNER_KEY?.trim());

  const mock = (reason: string): AttestationConfig => ({
    networkEnv,
    mode: "mock",
    chainId: CELO_SEPOLIA_CHAIN_ID,
    caip2: CELO_SEPOLIA_CAIP2,
    rpcUrl: env.RPC_URL?.trim() || "https://forno.celo-sepolia.celo-testnet.org",
    eas: "",
    schemaRegistry: "",
    erc8004Identity: "",
    erc8004Reputation: "",
    onChain: false,
    reason,
  });

  if (networkEnv !== "production") {
    return mock(
      "NETWORK_ENV is staging. EAS and ERC-8004 have no deployment on Celo Sepolia, " +
        "so attestations are simulated locally and are not real.",
    );
  }
  if (!hasSigner) {
    return mock(
      "NETWORK_ENV is production but ATTESTATION_SIGNER_KEY is unset, so nothing can be " +
        "signed. Attestations are simulated locally and are not real.",
    );
  }

  return {
    networkEnv,
    mode: "celo-mainnet",
    chainId: CELO_MAINNET_CHAIN_ID,
    caip2: CELO_MAINNET_CAIP2,
    rpcUrl: env.RPC_URL?.trim() || DEFAULT_CELO_RPC_URL,
    eas: env.EAS_CONTRACT?.trim() || EAS_CONTRACTS.eas,
    schemaRegistry: env.SCHEMA_REGISTRY?.trim() || EAS_CONTRACTS.schemaRegistry,
    erc8004Identity: env.ERC8004_IDENTITY?.trim() || ERC8004_CONTRACTS.identity,
    erc8004Reputation: env.ERC8004_REPUTATION?.trim() || ERC8004_CONTRACTS.reputation,
    onChain: true,
    reason: "NETWORK_ENV is production with a signer configured. Attestations are real.",
  };
}
