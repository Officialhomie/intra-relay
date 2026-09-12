#!/usr/bin/env node
// One-time ERC-8004 Identity Registry registration for the Celo "Agents at
// Work" hackathon (ADR-018, CLAUDE.md §4.1). Run manually, once, by Victor —
// this is a real mainnet transaction signed by a real wallet and is never
// executed by an agent on its own.
//
// Usage:
//   ERC8004_PRIVATE_KEY=0x... node scripts/register-erc8004-agent.mjs
//
// The private key is read from the environment, used only in-process to sign
// the transaction, and never logged or written anywhere.

import { createWalletClient, createPublicClient, http, parseAbi, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const IDENTITY_REGISTRY_ADDRESS = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432";
const RPC_URL = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
const APP_URL = process.env.INTRA_APP_URL ?? "https://intra-relay.vercel.app";

const registryAbi = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

function buildAgentMetadata() {
  const metadata = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Intra Relay",
    description:
      "Merchant-side capability and control layer for WhatsApp-native, non-API businesses. Lets a buyer agent get a structured flyer-printing quote from a real Nigerian supplier and route a human-approved order.",
    image: `${APP_URL}/icon-512.png`,
    services: [{ name: "web", endpoint: APP_URL }],
    x402Support: true,
    active: true,
  };
  const json = JSON.stringify(metadata);
  const base64 = Buffer.from(json, "utf8").toString("base64");
  return `data:application/json;base64,${base64}`;
}

async function main() {
  const privateKey = process.env.ERC8004_PRIVATE_KEY;
  if (!privateKey) {
    console.error(
      "Set ERC8004_PRIVATE_KEY (0x-prefixed) in your environment before running this script.",
    );
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: celo, transport: http(RPC_URL) });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Registering from ${account.address} (balance: ${balance} wei CELO)`);
  if (balance === 0n) {
    console.error("This wallet has no CELO for gas. Fund it on Celo mainnet before continuing.");
    process.exit(1);
  }

  const agentURI = buildAgentMetadata();
  const registry = getContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: registryAbi,
    client: { public: publicClient, wallet: walletClient },
  });

  console.log("Simulating register() call...");
  const { request } = await publicClient.simulateContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "register",
    args: [agentURI],
    account,
  });

  console.log("Sending transaction...");
  const txHash = await walletClient.writeContract(request);
  console.log(`Tx sent: https://celoscan.io/tx/${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const registeredLog = receipt.logs.find(
    (log) => log.address.toLowerCase() === IDENTITY_REGISTRY_ADDRESS.toLowerCase(),
  );
  if (!registeredLog) {
    console.error(
      "Transaction confirmed but no Registered event found. Inspect the receipt manually:",
      receipt,
    );
    process.exit(1);
  }

  // Registered(uint256 indexed agentId, string agentURI, address indexed owner)
  // agentId is the first indexed topic after the event signature.
  const agentIdHex = registeredLog.topics[1];
  const agentId = BigInt(agentIdHex).toString();

  console.log("\nRegistered successfully.");
  console.log(`agentId: ${agentId}`);
  console.log(`8004scan URL:  https://8004scan.io/agents/celo/${agentId}`);
  console.log(`Celoscan NFT:  https://celoscan.io/nft/${IDENTITY_REGISTRY_ADDRESS}/${agentId}`);
  console.log(`Agent wallet (defaults to owner): ${account.address}`);
}

main().catch((error) => {
  console.error("Registration failed:", error);
  process.exit(1);
});
