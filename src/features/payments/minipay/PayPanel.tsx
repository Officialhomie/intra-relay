"use client";

/**
 * The buyer's order-payment surface (M10.5 §6, §7, §17, §22, §24, §32–§34;
 * ADR-023). Appears on the task page once an offer is accepted. Additive — the
 * WhatsApp handoff sits right beside it and always works.
 *
 * Two explicit human actions stay separate (§34): the buyer already approved
 * the COMMERCIAL terms (accepting the quote); here they approve the WALLET
 * transaction. No ABI, contract address, chain id, or gas mechanics on the
 * default view (§6) — "network fee" language only (§47).
 */

import { useEffect } from "react";

import { ExternalLink, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { Card, CardTitle } from "@/components/ui/Section";
import { useAnalytics } from "@/features/analytics/useAnalytics";
import type { PublicOrderPayment } from "@/features/payments/order/service";
import { formatDateTime, formatMoney } from "@/lib/format";

import { hasInjectedWallet, isMiniPay, paymentMethod } from "./detect";
import { useOrderPayment } from "./useOrderPayment";

function ngnFromMinor(minor: string | null): string {
  if (!minor) return "";
  return formatMoney((Number(minor) / 100).toString(), "NGN");
}

export function PayPanel({
  taskId,
  businessName,
  orderSummary,
  initial,
  onChanged,
}: {
  taskId: string;
  businessName: string;
  orderSummary: string;
  initial: PublicOrderPayment | null;
  onChanged?: () => void;
}) {
  const analytics = useAnalytics("buyer");
  const { payment, phase, message, start, cancel } = useOrderPayment(taskId, initial);
  const wallet = hasInjectedWallet();
  const inMiniPay = isMiniPay();

  useEffect(() => {
    analytics.track("payment_method_viewed", {
      minipay_available: inMiniPay,
      wallet_available: wallet,
    });
    if (inMiniPay)
      analytics.track("minipay_available", { minipay_available: true, wallet_available: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "confirmed") {
      analytics.track("payment_receipt_viewed", { payment_method: paymentMethod() });
      onChanged?.();
    }
  }, [phase, analytics, onChanged]);

  // --- confirmed: receipt ------------------------------------------------
  if (payment?.paid || phase === "confirmed") {
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden className="size-5 shrink-0 text-success" />
          <CardTitle>Payment confirmed</CardTitle>
        </div>
        <DataList>
          <DataRow label="Business">{businessName}</DataRow>
          <DataRow label="Amount">
            {ngnFromMinor(payment?.amountNgnMinor ?? null)}
            {payment?.amountUsdcDisplay ? ` · ${payment.amountUsdcDisplay} USDC` : ""}
          </DataRow>
          <DataRow label="Status">Paid</DataRow>
        </DataList>
        {payment?.explorerUrl ? (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer font-medium">Transaction details</summary>
            <p className="mt-2 break-all">
              <a
                href={payment.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                View transaction <ExternalLink aria-hidden className="size-3" />
              </a>
            </p>
          </details>
        ) : null}
      </Card>
    );
  }

  // --- unavailable -----------------------------------------------------
  if (payment && !payment.offered && payment.reason) {
    return (
      <Callout tone="unavailable" title="Paying in the app isn't available for this order">
        {payment.reason} You can still send the WhatsApp message below to agree and pay directly.
      </Callout>
    );
  }

  const busy = phase === "creating" || phase === "wallet" || phase === "submitting";
  const inFlight =
    phase === "confirming" || payment?.status === "SUBMITTED" || payment?.status === "CONFIRMING";
  const ngn = ngnFromMinor(payment?.amountNgnMinor ?? initial?.amountNgnMinor ?? null);

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet aria-hidden className="size-5 shrink-0 text-primary" />
        <CardTitle>Pay for your order</CardTitle>
      </div>

      <p className="text-sm text-muted">
        You&apos;ve agreed the price with {businessName}. Pay them securely from your wallet, or use
        the WhatsApp handoff below.
      </p>

      <DataList>
        <DataRow label="Business">{businessName}</DataRow>
        <DataRow label="Order">{orderSummary}</DataRow>
        <DataRow label="Amount">{ngn || "—"}</DataRow>
        {payment?.amountUsdcDisplay ? (
          <DataRow
            label="You'll pay"
            hint={
              payment.rateSource && payment.rateLockedAt
                ? `≈ reference rate from ${payment.rateSource}, locked ${formatDateTime(payment.rateLockedAt)}`
                : undefined
            }
          >
            {payment.amountUsdcDisplay} USDC
          </DataRow>
        ) : null}
        {payment?.recipientShort ? (
          <DataRow label="Goes to">{payment.recipientShort}</DataRow>
        ) : null}
      </DataList>

      {inFlight ? (
        <Callout tone="info" title="Payment submitted">
          {message ?? "We're waiting for the network to confirm it. This page updates on its own."}
        </Callout>
      ) : phase === "cancelled" ? (
        <Callout tone="unavailable">Payment cancelled. Nothing was confirmed.</Callout>
      ) : phase === "failed" ? (
        <Callout tone="warning" title="The payment didn't go through">
          {message ?? "No payment was confirmed. Try again, or use the WhatsApp handoff."}
        </Callout>
      ) : null}

      {!inFlight ? (
        <div className="space-y-2">
          {wallet ? (
            <>
              <Button pending={busy} onClick={() => void start()}>
                {phase === "creating"
                  ? "Preparing…"
                  : phase === "wallet"
                    ? "Waiting for your wallet…"
                    : phase === "submitting"
                      ? "Recording…"
                      : inMiniPay
                        ? "Pay with MiniPay"
                        : "Pay from your wallet"}
              </Button>
              <p className="text-xs text-subtle">
                Your wallet will ask you to confirm this payment. The network fee is paid from your
                wallet balance.
              </p>
              {busy ? (
                <button
                  type="button"
                  onClick={() => void cancel()}
                  className="text-xs font-medium text-muted underline underline-offset-2"
                >
                  Cancel
                </button>
              ) : null}
            </>
          ) : (
            <Callout tone="info" title="Pay from your Celo wallet">
              Open this order in MiniPay to pay the business directly from your wallet. Or use the
              WhatsApp handoff below.
            </Callout>
          )}
        </div>
      ) : null}
    </Card>
  );
}
