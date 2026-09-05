/**
 * Register the two EAS schemas on the Celo mainnet SchemaRegistry (ADR-018,
 * milestone 9 §4).
 *
 *   npm run eas:register -- --estimate     # gas estimate only, sends nothing
 *   npm run eas:register                   # sends the registration transactions
 *
 * This is a HUMAN-run, funds-spending step. It reads `ATTESTATION_SIGNER_KEY`
 * from the environment (never a flag, never logged) and the signer address
 * must hold a little CELO for gas. It:
 *
 *   1. checks whether each schema is already registered (read-only, free);
 *   2. registers any that are not;
 *   3. reads the on-chain UID back and asserts it equals the locally derived
 *      one (`schema.ts`), so a wrong value can never be pasted into config;
 *   4. prints the tx hashes and UIDs to record.
 *
 * It registers nothing that is already present and changes no schema string —
 * the strings are load-bearing (their UID is derived from them).
 */
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

import { DEFAULT_CELO_RPC_URL } from "./config";
import { EAS_CONTRACTS } from "./chain";
import {
  COMMITMENT_SCHEMA,
  COMMITMENT_SCHEMA_UID,
  HANDOVER_SCHEMA,
  HANDOVER_SCHEMA_UID,
  SCHEMA_RESOLVER,
  SCHEMA_REVOCABLE,
} from "./schema";

const SCHEMA_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "getSchema",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "schema", type: "string" },
        ],
      },
    ],
  },
] as const;

const ZERO_UID = `0x${"0".repeat(64)}` as Hex;

const SCHEMAS = [
  { name: "commitment", schema: COMMITMENT_SCHEMA, expectedUid: COMMITMENT_SCHEMA_UID },
  { name: "handover", schema: HANDOVER_SCHEMA, expectedUid: HANDOVER_SCHEMA_UID },
] as const;

async function main() {
  const estimateOnly = process.argv.includes("--estimate");
  const rpcUrl = process.env.RPC_URL?.trim() || DEFAULT_CELO_RPC_URL;
  const key = process.env.ATTESTATION_SIGNER_KEY?.trim();
  if (!key) {
    console.error(
      "ATTESTATION_SIGNER_KEY is not set. Set it in the environment (never as a flag).",
    );
    process.exit(1);
  }

  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: celo, transport });
  const wallet = createWalletClient({ account, chain: celo, transport });
  const registry = EAS_CONTRACTS.schemaRegistry as Hex;

  console.log(`SchemaRegistry: ${registry}`);
  console.log(`Signer:         ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Signer balance: ${balance} wei CELO`);
  console.log(
    estimateOnly ? "Mode:           ESTIMATE ONLY (nothing sent)\n" : "Mode:           LIVE\n",
  );

  for (const { name, schema, expectedUid } of SCHEMAS) {
    console.log(`--- ${name} ---`);
    console.log(`schema:       ${schema}`);
    console.log(`derived UID:  ${expectedUid}`);

    const existing = await publicClient.readContract({
      address: registry,
      abi: SCHEMA_REGISTRY_ABI,
      functionName: "getSchema",
      args: [expectedUid],
    });

    if (existing.uid !== ZERO_UID) {
      const matches = existing.schema === schema;
      console.log(`already registered on-chain: ${existing.uid}`);
      console.log(`schema string matches derived: ${matches ? "yes" : "NO — investigate"}`);
      console.log("");
      continue;
    }

    if (estimateOnly) {
      const gas = await publicClient.estimateContractGas({
        address: registry,
        abi: SCHEMA_REGISTRY_ABI,
        functionName: "register",
        args: [schema, SCHEMA_RESOLVER, SCHEMA_REVOCABLE],
        account,
      });
      const gasPrice = await publicClient.getGasPrice();
      console.log(`estimated gas:   ${gas}`);
      console.log(`gas price:       ${gasPrice} wei`);
      console.log(`estimated cost:  ${gas * gasPrice} wei CELO`);
      console.log("");
      continue;
    }

    const txHash = await wallet.writeContract({
      address: registry,
      abi: SCHEMA_REGISTRY_ABI,
      functionName: "register",
      args: [schema, SCHEMA_RESOLVER, SCHEMA_REVOCABLE],
    });
    console.log(`register tx:  ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      console.error(`register tx REVERTED: ${txHash}`);
      process.exit(1);
    }

    const registered = await publicClient.readContract({
      address: registry,
      abi: SCHEMA_REGISTRY_ABI,
      functionName: "getSchema",
      args: [expectedUid],
    });
    const ok = registered.uid === expectedUid && registered.schema === schema;
    console.log(`on-chain UID: ${registered.uid}`);
    console.log(`matches derived UID + schema string: ${ok ? "yes" : "NO — do not use"}`);
    if (!ok) process.exit(1);
    console.log("");
  }

  console.log("Done. Record the UIDs above. No config change is needed — the app derives");
  console.log("these same UIDs from the schema strings and asserts them against the chain.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
