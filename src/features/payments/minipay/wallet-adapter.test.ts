// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { payOrder, WalletPayError } from "./wallet-adapter";

/**
 * The wallet adapter is the ONE place a wallet transaction is built (M10.5 §12,
 * §46). It uses the project's viem stack over the injected EIP-1193 provider —
 * no ethers, no wagmi — talks only to the wallet, and never decides an amount
 * or recipient (those come from the server intent it is handed).
 */

const CELO_HEX = "0xa4ec"; // 42220
const USDC = "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C";
const RECIPIENT = `0x${"b".repeat(40)}`;
const ACCOUNT = `0x${"1".repeat(40)}`;
const TX = `0x${"f".repeat(64)}`;

const INPUT = {
  assetAddress: USDC,
  recipientAddress: RECIPIENT,
  amountAtomic: "30000000",
  chainId: 42220,
};

interface Handlers {
  [method: string]: (params?: unknown[]) => unknown;
}

function installProvider(handlers: Handlers = {}, isMiniPay = true) {
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (handlers[method]) return handlers[method](params);
    switch (method) {
      case "eth_chainId":
        return CELO_HEX;
      case "eth_accounts":
      case "eth_requestAccounts":
        return [ACCOUNT];
      case "eth_sendTransaction":
        return TX;
      case "wallet_switchEthereumChain":
        return null;
      default:
        return null;
    }
  });
  (window as { ethereum?: unknown }).ethereum = { request, isMiniPay };
  return request;
}

beforeEach(() => {
  delete (window as { ethereum?: unknown }).ethereum;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { ethereum?: unknown }).ethereum;
});

describe("payOrder — preconditions", () => {
  it("throws WALLET_UNAVAILABLE when no wallet is injected", async () => {
    await expect(payOrder(INPUT)).rejects.toMatchObject({ code: "WALLET_UNAVAILABLE" });
  });

  it("throws WRONG_CHAIN when the intent is not for Celo", async () => {
    installProvider();
    await expect(payOrder({ ...INPUT, chainId: 1 })).rejects.toMatchObject({ code: "WRONG_CHAIN" });
  });
});

describe("payOrder — the happy path", () => {
  it("sends an ERC-20 transfer to the USDC contract for the exact server amount", async () => {
    const request = installProvider();
    const result = await payOrder(INPUT);

    expect(result.txHash).toBe(TX);
    const send = request.mock.calls.find((c) => c[0].method === "eth_sendTransaction");
    expect(send).toBeTruthy();
    const [tx] = send![0].params as [{ to: string; data: string; value?: string }];
    expect(tx.to.toLowerCase()).toBe(USDC.toLowerCase());
    // transfer(address,uint256) selector, then the recipient, then 30_000_000.
    expect(tx.data.startsWith("0xa9059cbb")).toBe(true);
    expect(tx.data.toLowerCase()).toContain("b".repeat(40));
    expect(BigInt(`0x${tx.data.slice(-64)}`)).toBe(30_000_000n);
  });

  it("appends the ERC-8021 attribution suffix to calldata when a tag is supplied", async () => {
    const request = installProvider();
    await payOrder({ ...INPUT, attributionTag: "celo_b7k3p9da" });

    const send = request.mock.calls.find((c) => c[0].method === "eth_sendTransaction");
    const [tx] = send![0].params as [{ to: string; data: string }];
    // The selector + args are unchanged — only bytes are appended after them.
    expect(tx.data.startsWith("0xa9059cbb")).toBe(true);
    expect(tx.data.toLowerCase()).toContain("b".repeat(40));
    // ERC-8021 Schema 0 marker, present when a tag is appended.
    expect(tx.data.toLowerCase()).toContain("8021802180218021802180218021");
  });

  it("sends the plain transfer with no suffix when there is no tag yet (pre-registration)", async () => {
    const request = installProvider();
    await payOrder({ ...INPUT, attributionTag: null });

    const send = request.mock.calls.find((c) => c[0].method === "eth_sendTransaction");
    const [tx] = send![0].params as [{ data: string }];
    expect(BigInt(`0x${tx.data.slice(-64)}`)).toBe(30_000_000n);
    expect(tx.data.toLowerCase()).not.toContain("8021802180218021802180218021");
  });

  it("switches the wallet to Celo when it is on another network", async () => {
    let chain = "0x1";
    const request = installProvider({
      eth_chainId: () => chain,
      wallet_switchEthereumChain: () => {
        chain = CELO_HEX;
        return null;
      },
    });
    const result = await payOrder(INPUT);
    expect(result.txHash).toBe(TX);
    expect(request.mock.calls.some((c) => c[0].method === "wallet_switchEthereumChain")).toBe(true);
  });
});

describe("payOrder — the buyer stays in control", () => {
  it("maps an EIP-1193 4001 rejection to USER_REJECTED (not a failure)", async () => {
    installProvider({
      eth_sendTransaction: () => {
        throw { code: 4001, message: "User rejected the request." };
      },
    });
    await expect(payOrder(INPUT)).rejects.toMatchObject({
      code: "USER_REJECTED",
      message: "Payment cancelled.",
    });
  });

  it("USER_REJECTED when the buyer declines the network switch", async () => {
    installProvider({
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        throw { code: 4001, message: "User rejected" };
      },
    });
    await expect(payOrder(INPUT)).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("surfaces any other wallet error as SEND_FAILED", async () => {
    installProvider({
      eth_sendTransaction: () => {
        throw new Error("insufficient funds for gas");
      },
    });
    await expect(payOrder(INPUT)).rejects.toBeInstanceOf(WalletPayError);
    await expect(payOrder(INPUT)).rejects.toMatchObject({ code: "SEND_FAILED" });
  });
});
