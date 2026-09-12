/**
 * The single declaration of the injected EIP-1193 wallet provider (M10.5).
 *
 * Both the MiniPay payment path and the M9 merchant-handover signature use
 * `window.ethereum`; declaring it in one place avoids a duplicate-global type
 * error. This is a minimal surface — enough for `request(...)` and the MiniPay
 * `isMiniPay` marker. No wallet framework, no wagmi.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  /** Set to `true` inside the MiniPay in-app browser. */
  isMiniPay?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}
