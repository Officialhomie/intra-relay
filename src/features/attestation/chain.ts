/**
 * Celo mainnet contract addresses for the attestation layer (ADR-018).
 *
 * Every address here was read from a canonical source on 2026-09-01:
 *   - EAS / SchemaRegistry: the `ethereum-attestation-service/eas-contracts`
 *     deployment artifacts at `deployments/celo/{EAS,SchemaRegistry}.json`.
 *   - ERC-8004 registries: `docs.celo.org/build-on-celo/build-with-ai/8004`.
 *
 * Do not edit without re-checking the source. A wrong address does not throw —
 * it silently writes an attestation nobody can find, or sends a call nowhere.
 *
 * Pure public data; safe to import anywhere (server or client).
 */

export const CELO_MAINNET_CHAIN_ID = 42220;

/** CAIP-2 id, matching the convention already used by the x402 adapter. */
export const CELO_MAINNET_CAIP2 = "eip155:42220";

export const EAS_CONTRACTS = {
  /** Ethereum Attestation Service — attest / getAttestation / revoke. */
  eas: "0x72E1d8ccf5299fb36fEfD8CC4394B8ef7e98Af92",
  /** EAS SchemaRegistry — register / getSchema. */
  schemaRegistry: "0x5ece93bE4BDCF293Ed61FA78698B594F2135AF34",
} as const;

export const ERC8004_CONTRACTS = {
  /** ERC-721 agent identity registry. */
  identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  /** Feedback registry — giveFeedback / readAllFeedback / getSummary. */
  reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
} as const;

export const CELOSCAN_TX_BASE = "https://celoscan.io/tx/";
export const CELOSCAN_ADDRESS_BASE = "https://celoscan.io/address/";

/** EAS explorer entry for one attestation UID, or null if the UID is malformed. */
export function easExplorerUrl(uid: string): string | null {
  return /^0x[0-9a-fA-F]{64}$/.test(uid)
    ? `https://celo.easscan.org/attestation/view/${uid}`
    : null;
}
