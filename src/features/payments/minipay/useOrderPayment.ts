"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useAnalytics } from "@/features/analytics/useAnalytics";
import type { PublicOrderPayment } from "@/features/payments/order/service";

import { paymentEnvironment, paymentMethod } from "./detect";
import { payOrder, WalletPayError } from "./wallet-adapter";

export type PayPhase =
  | "idle"
  | "creating"
  | "wallet"
  | "submitting"
  | "confirming"
  | "confirmed"
  | "cancelled"
  | "failed";

interface State {
  payment: PublicOrderPayment | null;
  phase: PayPhase;
  message: string | null;
}

const POLL_MS = 2500;
const POLL_MAX = 40; // ~100s then "still checking"

/** Maps a server payment row + wallet flow into one phase for the panel. */
function phaseForStatus(status: PublicOrderPayment["status"] | null): PayPhase {
  switch (status) {
    case "CONFIRMED":
      return "confirmed";
    case "SUBMITTED":
    case "CONFIRMING":
      return "confirming";
    case "CANCELLED":
      return "cancelled";
    case "FAILED":
    case "EXPIRED":
      return "failed";
    default:
      return "idle";
  }
}

export function useOrderPayment(taskId: string, initial: PublicOrderPayment | null) {
  const analytics = useAnalytics("buyer");
  const [state, setState] = useState<State>({
    payment: initial,
    phase: phaseForStatus(initial?.status ?? null),
    message: initial?.reason ?? null,
  });
  const polls = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const p = await apiRequest<PublicOrderPayment>(`/api/tasks/${taskId}/order-payment`, {
        sessionId: getSessionId(),
      });
      setState((s) => ({
        payment: p,
        phase: phaseForStatus(p.status),
        message: s.phase === "wallet" || s.phase === "submitting" ? s.message : (p.reason ?? null),
      }));
      return p;
    } catch {
      return null;
    }
  }, [taskId]);

  // Resume from server truth on mount (§22), and start polling anything in flight.
  useEffect(() => {
    if (initial && (initial.status === "SUBMITTED" || initial.status === "CONFIRMING")) {
      analytics.track("payment_resumed", { payment_method: paymentMethod() });
    }
    void refresh();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = state.payment?.status;
    if (s === "SUBMITTED" || s === "CONFIRMING") {
      stopPolling();
      pollTimer.current = setTimeout(async () => {
        polls.current += 1;
        const p = await refresh();
        if (
          polls.current >= POLL_MAX &&
          p &&
          (p.status === "SUBMITTED" || p.status === "CONFIRMING")
        ) {
          setState((st) => ({
            ...st,
            message:
              "Still checking with the network. You can close this and come back — the status is saved.",
          }));
        }
      }, POLL_MS);
    } else {
      stopPolling();
      polls.current = 0;
    }
    return stopPolling;
  }, [state.payment?.status, refresh, stopPolling]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const method = paymentMethod();
    analytics.track("minipay_selected", { payment_method: method });

    setState((s) => ({ ...s, phase: "creating", message: null }));
    let intent: PublicOrderPayment;
    try {
      intent = await apiRequest<PublicOrderPayment>(`/api/tasks/${taskId}/order-payment`, {
        method: "POST",
        sessionId: getSessionId(),
      });
    } catch (err) {
      startedRef.current = false;
      setState((s) => ({
        ...s,
        phase: "failed",
        message:
          err instanceof ApiError ? err.message : "Couldn't start the payment. Try again shortly.",
      }));
      return;
    }
    setState((s) => ({ ...s, payment: intent, phase: "wallet", message: null }));
    analytics.track("payment_intent_created", {
      payment_method: method,
      network: intent.chainId,
      asset: intent.asset,
    });

    if (
      !intent.assetAddress ||
      !intent.recipientAddress ||
      !intent.amountAtomic ||
      paymentEnvironment() === "none"
    ) {
      startedRef.current = false;
      setState((s) => ({
        ...s,
        phase: "failed",
        message: "No wallet is available in this browser. Open the order in MiniPay to pay.",
      }));
      return;
    }

    analytics.track("wallet_request_started", {
      payment_method: method,
      network: intent.chainId,
      asset: intent.asset,
    });

    let txHash: string;
    try {
      ({ txHash } = await payOrder({
        assetAddress: intent.assetAddress,
        recipientAddress: intent.recipientAddress,
        amountAtomic: intent.amountAtomic,
        chainId: intent.chainId,
        attributionTag: intent.attributionTag,
      }));
      analytics.track("wallet_approved", {
        payment_method: method,
        network: intent.chainId,
        asset: intent.asset,
      });
    } catch (err) {
      startedRef.current = false;
      const rejected = err instanceof WalletPayError && err.code === "USER_REJECTED";
      analytics.track("wallet_rejected", { payment_method: method });
      if (rejected) {
        try {
          await apiRequest(`/api/tasks/${taskId}/order-payment/cancel`, {
            method: "POST",
            sessionId: getSessionId(),
          });
        } catch {
          /* the order is fine regardless */
        }
        setState((s) => ({
          ...s,
          phase: "cancelled",
          message: "Payment cancelled. Nothing was confirmed.",
        }));
        return;
      }
      setState((s) => ({
        ...s,
        phase: "failed",
        message:
          err instanceof WalletPayError ? err.message : "The wallet couldn't send the payment.",
      }));
      return;
    }

    setState((s) => ({ ...s, phase: "submitting", message: null }));
    analytics.track("payment_submitted", {
      payment_method: method,
      network: intent.chainId,
      asset: intent.asset,
    });
    try {
      const p = await apiRequest<PublicOrderPayment>(`/api/tasks/${taskId}/order-payment/submit`, {
        method: "POST",
        sessionId: getSessionId(),
        body: { txHash },
      });
      setState((s) => ({
        ...s,
        payment: p,
        phase: phaseForStatus(p.status),
        message:
          p.status === "CONFIRMED"
            ? null
            : "Payment submitted. Waiting for the network to confirm it.",
      }));
    } catch (err) {
      // The tx is real and on-chain — this is a reporting hiccup, not a payment failure.
      setState((s) => ({
        ...s,
        phase: "confirming",
        message:
          "Payment submitted. We couldn't reach the server to track it — reopen the order and it will pick up.",
      }));
      void err;
    } finally {
      startedRef.current = false;
    }
  }, [taskId, analytics]);

  const cancel = useCallback(async () => {
    try {
      await apiRequest(`/api/tasks/${taskId}/order-payment/cancel`, {
        method: "POST",
        sessionId: getSessionId(),
      });
    } catch {
      /* nothing to lose */
    }
    setState((s) => ({
      ...s,
      phase: "cancelled",
      message: "Payment cancelled. Nothing was confirmed.",
    }));
  }, [taskId]);

  return { ...state, start, cancel, refresh };
}
