/**
 * MiniPay / injected-wallet capability detection (M10.5 §4, §5, ADR-023).
 *
 * Detection is based on the ACTUAL provider interface, never a user-agent
 * string (§4). It is cosmetic only — it decides how prominent the "Pay with
 * MiniPay" affordance is, never whether a payment is allowed. Every state
 * change still goes through the session-gated server routes (§43).
 *
 * SSR-safe: every function returns a stable value on the server.
 */

import "./provider";

/** True inside the MiniPay in-app browser — the wallet is pre-connected here. */
export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  return window.ethereum?.isMiniPay === true;
}

/** True when any EIP-1193 wallet is injected (MiniPay, or a desktop extension). */
export function hasInjectedWallet(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.ethereum?.request === "function";
}

export type PaymentEnv = "minipay" | "injected" | "none";

export function paymentEnvironment(): PaymentEnv {
  if (isMiniPay()) return "minipay";
  if (hasInjectedWallet()) return "injected";
  return "none";
}

/** The analytics `payment_method` value for the current environment. */
export function paymentMethod(): "minipay" | "injected" | "whatsapp" {
  const env = paymentEnvironment();
  return env === "none" ? "whatsapp" : env;
}
