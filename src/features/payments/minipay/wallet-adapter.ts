"use client";

/**
 * The wallet payment adapter (M10.5 §12, §13, §14, §46; ADR-023).
 *
 * The ONE place a wallet transaction is built. It uses the project's `viem`
 * stack over the injected EIP-1193 provider — no wagmi, no ethers, no wallet
 * framework (§12). It talks only to the wallet: it never calls an Intra API and
 * never decides an amount or recipient (those come from the server intent).
 *
 * Everything here is client-only and lazily imported so the module never pulls
 * viem into a server bundle.
 */

import { hasInjectedWallet } from "./detect";

export interface WalletPayInput {
  assetAddress: string;
  recipientAddress: string;
  /** USDC atomic units (6 decimals), as a decimal string. */
  amountAtomic: string;
  chainId: number;
  /**
   * ERC-8021 attribution tag from hackathon registration (server-supplied via
   * the intent — never entered or derived client-side). When present it is
   * appended to the transfer's calldata; a contract's `transfer(address,uint256)`
   * only reads its first 68 bytes, so the trailing tag never changes what the
   * transaction does. Omit or pass null before registration — the transfer
   * still sends, just untagged.
   */
  attributionTag?: string | null;
}

export type WalletPayErrorCode =
  "WALLET_UNAVAILABLE" | "USER_REJECTED" | "WRONG_CHAIN" | "SEND_FAILED";

export class WalletPayError extends Error {
  constructor(
    readonly code: WalletPayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletPayError";
  }
}

/** EIP-1193 user-rejection code, or a thrown "user rejected" string. */
function isUserRejection(error: unknown): boolean {
  const e = error as { code?: number; message?: string } | undefined;
  if (e?.code === 4001) return true;
  return /user rejected|user denied|rejected the request/i.test(e?.message ?? "");
}

/**
 * Ensure the wallet is on Celo, then send an ERC-20 `transfer` to the business.
 * Returns the transaction hash — NOT a confirmation. The server verifies.
 */
export async function payOrder(input: WalletPayInput): Promise<{ txHash: string }> {
  if (!hasInjectedWallet() || typeof window === "undefined" || !window.ethereum) {
    throw new WalletPayError("WALLET_UNAVAILABLE", "No wallet is available in this browser.");
  }
  const provider = window.ethereum;

  const [
    { createWalletClient, custom, encodeFunctionData, erc20Abi, getAddress, concat },
    { celo },
    { toDataSuffix },
  ] = await Promise.all([import("viem"), import("viem/chains"), import("@celo/attribution-tags")]);

  if (input.chainId !== celo.id) {
    throw new WalletPayError("WRONG_CHAIN", `Expected Celo (${celo.id}).`);
  }

  const wallet = createWalletClient({ chain: celo, transport: custom(provider) });

  // Network check — never trust the UI (§14, §46).
  let currentChain: number;
  try {
    currentChain = await wallet.getChainId();
  } catch {
    currentChain = 0;
  }
  if (currentChain !== celo.id) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${celo.id.toString(16)}` }],
      });
    } catch (error) {
      if (isUserRejection(error)) {
        throw new WalletPayError("USER_REJECTED", "You need to be on the Celo network to pay.");
      }
      throw new WalletPayError(
        "WRONG_CHAIN",
        "Switch your wallet to the Celo network to continue.",
      );
    }
    if ((await wallet.getChainId().catch(() => 0)) !== celo.id) {
      throw new WalletPayError("WRONG_CHAIN", "Your wallet is not on the Celo network.");
    }
  }

  const [account] = await wallet.getAddresses();
  if (!account) {
    throw new WalletPayError("WALLET_UNAVAILABLE", "Your wallet did not share an address.");
  }

  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [getAddress(input.recipientAddress), BigInt(input.amountAtomic)],
  });
  // Append the ERC-8021 attribution suffix, when we have one. The tag cannot
  // be added after the transaction is sent, so this is the one place it must
  // happen (hackathon registration rules).
  const data = input.attributionTag
    ? concat([transferData, toDataSuffix(input.attributionTag)])
    : transferData;

  try {
    const txHash = await wallet.sendTransaction({
      account,
      chain: celo,
      to: getAddress(input.assetAddress),
      data,
      value: 0n,
    });
    return { txHash };
  } catch (error) {
    if (isUserRejection(error)) {
      throw new WalletPayError("USER_REJECTED", "Payment cancelled.");
    }
    throw new WalletPayError(
      "SEND_FAILED",
      error instanceof Error ? error.message : "The wallet could not send the payment.",
    );
  }
}
