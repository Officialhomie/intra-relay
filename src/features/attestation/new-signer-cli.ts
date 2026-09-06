/**
 * Generate a fresh relayer keypair for `ATTESTATION_SIGNER_KEY` (milestone 9 §20).
 *
 *   npm run eas:new-signer
 *
 * Writes the private key to `.attestation-signer-key` (gitignored) and prints
 * ONLY the public address. This wallet:
 *   - pays gas to relay commitment + handover attestations;
 *   - is the attester of record for the COMMITMENT attestation only
 *     (the handover attestation's attester is the merchant's own wallet);
 *   - should hold a small amount of CELO for gas and nothing else.
 *
 * Set the printed key as `ATTESTATION_SIGNER_KEY` in the environment, then
 * delete the file. Never commit it, never paste it anywhere.
 */
import { writeFileSync } from "node:fs";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const key = generatePrivateKey();
const account = privateKeyToAccount(key);
const outFile = ".attestation-signer-key";

writeFileSync(outFile, key, { mode: 0o600 });

console.log(`Relayer address: ${account.address}`);
console.log(
  `Private key written to: ${outFile} (gitignored — retrieve it, set the env var, delete the file)`,
);
console.log("");
console.log("Next:");
console.log(
  `  1. Send a small amount of CELO (see: npm run eas:register -- --estimate) to ${account.address}`,
);
console.log("  2. Set ATTESTATION_SIGNER_KEY to the key in the file (Vercel env or local .env)");
console.log("  3. rm .attestation-signer-key");
