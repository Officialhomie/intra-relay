"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { CheckCircle2, Clock3, Copy, ExternalLink, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { ErrorState, LoadingPanel } from "@/components/ui/States";
import { Card, CardTitle, SectionHeader } from "@/components/ui/Section";
import { StatusPill, taskStatusTone } from "@/components/ui/StatusPill";
import { ApiError, apiRequest } from "@/lib/api";
import { formatDateTime, formatMoney, isExpired, relativeTime } from "@/lib/format";
import { getSessionId } from "@/lib/session";
import { BuyerPickupPanel } from "@/features/proofline/BuyerPickupPanel";
import type { ProoflineView } from "@/features/proofline/view";
import { CELO_X402_NETWORKS, explorerTxUrl } from "@/features/payments/adapter/networks";

interface TaskViewDto {
  task: {
    id: string;
    status: string;
    structuredInput: Record<string, unknown> | null;
    failureReason: string | null;
    submittedAt: string | null;
    quotedAt: string | null;
    buyerDecision: "ACCEPTED" | "DECLINED" | null;
    buyerDecidedAt: string | null;
    buyerDeclineReason: string | null;
    handoffConfirmedAt: string | null;
    closedAt: string | null;
    createdAt: string;
  };
  route: {
    name: string;
    status: string;
    responseSlaMinutes: number;
    priceUpdatedAt: string | null;
    verifiedAt: string | null;
  } | null;
  supplier: {
    name: string;
    city: string;
    country: string;
    contactChannelType: string | null;
    contactChannelValue: string | null;
  } | null;
  quotes: {
    id: string;
    status: string;
    effectiveStatus: string;
    amountMin: string;
    amountMax: string | null;
    deliveryCharge: string | null;
    currency: string;
    turnaround: string;
    availabilityNote: string | null;
    assumptions: string | null;
    confidence: string | null;
    fixed: boolean;
    expiresAt: string | null;
    declineReason: string | null;
  }[];
  payments: {
    id: string;
    status: string;
    maxFeeUsd: string;
    provider: string | null;
    network: string | null;
    assetSymbol: string | null;
    amountAtomic: string | null;
    txHash: string | null;
    errorCode: string | null;
    attributionTag: string | null;
    settledAt: string | null;
  }[];
  recommendation: {
    rationale: string;
    orderMessage: string;
    reasoning: string[];
    uncertainties: string[];
    verificationNote: string;
    quoteExpired: boolean;
    normalized: {
      currency: string;
      priceBasis: "fixed" | "estimate";
      totalMin: number;
      totalMax: number | null;
      quantity: number | null;
      unitPriceMin: number | null;
      unitPriceMax: number | null;
      turnaround: { label: string; businessDays: number | null; hours: number | null };
      assumptions: string[];
    };
  } | null;
  feedback: { id: string; useful: boolean; comment: string | null }[];
  timeline: { id: string; type: string; createdAt: string; data: Record<string, unknown> }[];
  handoffConfirmedAt: string | null;
  proofline: ProoflineView | null;
}

const EVENT_LABEL: Record<string, string> = {
  "task.created": "Request created",
  "task.submitted": "Request submitted",
  "task.awaiting_quote": "Sent to the printer",
  "payment.unavailable": "Agent service payment unavailable",
  "payment.pending": "Agent service payment pending",
  "payment.challenge_issued": "Payment requested (402)",
  "payment.settled": "Query fee settled on-chain",
  "payment.failed": "Payment attempt failed",
  "payment.indeterminate": "Payment settlement outcome unknown",
  "quote.received": "Quote received",
  "quote.declined": "Printer declined",
  "quote.expired": "Quote expired",
  "recommendation.created": "Recommendation prepared",
  "task.buyer_accepted": "You chose to proceed with this printer",
  "task.buyer_declined": "You chose not to proceed",
  "task.handoff_ready": "Ready for your WhatsApp handoff",
  "task.handoff_confirmed": "You confirmed the message was sent",
  "task.failed": "Request could not be completed",
  "proofline.ready_for_pickup": "Printer marked the order ready for pickup",
  "proofline.pickup_confirmed": "You confirmed you collected the order",
  "feedback.received": "Feedback recorded",
};

export function TaskPage({ taskId }: { taskId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<TaskViewDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden" | "missing">(
    "loading",
  );

  useEffect(() => setSessionId(getSessionId()), []);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setState((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const data = await apiRequest<TaskViewDto>(`/api/tasks/${taskId}`, { sessionId });
      setView(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setState("forbidden");
      else if (error instanceof ApiError && error.status === 404) setState("missing");
      else setState("error");
    }
  }, [sessionId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading" || !sessionId) {
    return (
      <div className="space-y-6">
        <SectionHeader eyebrow="Your request" title="Printing quote" />
        <LoadingPanel label="Loading your request" />
      </div>
    );
  }

  if (state === "forbidden") {
    return (
      <ErrorState
        title="This request belongs to another device"
        description="Requests are tied to the browser that created them. Open the link on that device, or start a new request."
        action={
          <Link href="/request" className="text-sm font-medium text-primary underline">
            Start a new request
          </Link>
        }
      />
    );
  }

  if (state === "missing") {
    return (
      <ErrorState
        title="Request not found"
        description="The link may be wrong or the request was removed."
        action={
          <Link href="/request" className="text-sm font-medium text-primary underline">
            Start a new request
          </Link>
        }
      />
    );
  }

  if (state === "error" || !view) {
    return (
      <ErrorState
        description="Could not load this request."
        action={
          <Button size="sm" variant="secondary" onClick={load}>
            Try again
          </Button>
        }
      />
    );
  }

  const { task, route, supplier, quotes, payments, recommendation, timeline, handoffConfirmedAt } =
    view;
  const quote = quotes[0] ?? null;
  const brief = task.structuredInput ?? {};
  const supplierDeclined =
    quote?.status === "DECLINED" || task.failureReason === "SUPPLIER_DECLINED";
  const quoteExpired = quote?.effectiveStatus === "EXPIRED";
  const awaitingDecision = task.status === "RECOMMENDED";
  const readyForHandoff = task.status === "HANDOFF_READY";
  const buyerDeclined = task.status === "CANCELLED";

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Your request"
        title={route?.name ?? "Printing quote"}
        description={`Created ${relativeTime(task.createdAt)}`}
        actions={
          <StatusPill tone={taskStatusTone(task.status)}>
            {task.status.replace(/_/g, " ")}
          </StatusPill>
        }
      />

      {task.status === "FAILED" ? (
        <Callout tone="warning" title="This request could not be completed">
          {task.failureReason === "SUPPLIER_DECLINED"
            ? `The printer declined${quote?.declineReason ? `: "${quote.declineReason}"` : "."}`
            : "The route became unavailable before a quote could be requested. No payment was taken."}{" "}
          You can{" "}
          <Link href="/request" className="underline">
            send a new request
          </Link>
          .
        </Callout>
      ) : null}

      {buyerDeclined ? (
        <Callout tone="info" title="You decided not to proceed with this quote">
          {task.buyerDeclineReason ? `Your note: "${task.buyerDeclineReason}". ` : ""}
          Nothing was ordered and no payment was taken. You can{" "}
          <Link href="/request" className="underline">
            send a new request
          </Link>
          .
        </Callout>
      ) : null}

      <Card>
        <CardTitle>Your brief</CardTitle>
        <DataList className="mt-4">
          {Object.entries(brief).map(([key, value]) => (
            <DataRow key={key} label={key}>
              {String(value)}
            </DataRow>
          ))}
          {route ? (
            <DataRow
              label="Route freshness"
              hint={
                route.priceUpdatedAt
                  ? `Prices confirmed ${relativeTime(route.priceUpdatedAt)}`
                  : "Prices not yet confirmed"
              }
            >
              Verified {route.verifiedAt ? relativeTime(route.verifiedAt) : "—"} · SLA{" "}
              {route.responseSlaMinutes} min
            </DataRow>
          ) : null}
        </DataList>
      </Card>

      {quote && !supplierDeclined ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>The quote</CardTitle>
            <div className="flex items-center gap-2">
              {quoteExpired ? <StatusPill tone="warning">Expired</StatusPill> : null}
              <span className="text-xs font-medium uppercase tracking-wide text-subtle">
                {quote.fixed ? "Fixed price" : "Estimate — confirm before paying"}
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-subtle">
            Entered by the printer or an Intra operator. Not independently checked by Intra.
          </p>
          <DataList className="mt-4">
            <DataRow label="Price">
              {quote.amountMax && quote.amountMax !== quote.amountMin
                ? `${formatMoney(quote.amountMin, quote.currency)} – ${formatMoney(quote.amountMax, quote.currency)}`
                : formatMoney(quote.amountMin, quote.currency)}
            </DataRow>
            {quote.deliveryCharge ? (
              <DataRow label="Delivery charge">
                {formatMoney(quote.deliveryCharge, quote.currency)}
              </DataRow>
            ) : null}
            <DataRow label="Turnaround">{quote.turnaround}</DataRow>
            {quote.availabilityNote ? (
              <DataRow label="Availability">{quote.availabilityNote}</DataRow>
            ) : null}
            {quote.assumptions ? <DataRow label="Assumptions">{quote.assumptions}</DataRow> : null}
            {quote.confidence ? <DataRow label="Confidence">{quote.confidence}</DataRow> : null}
            <DataRow label="Quote validity">
              {quote.expiresAt ? (
                isExpired(quote.expiresAt) ? (
                  <span className="text-warning">
                    Expired {relativeTime(quote.expiresAt)} — reconfirm the price before paying
                  </span>
                ) : (
                  <span>
                    <Clock3 aria-hidden className="mr-1 inline size-3.5" />
                    Valid until {formatDateTime(quote.expiresAt)} ({relativeTime(quote.expiresAt)})
                  </span>
                )
              ) : (
                "No stated expiry — treat as an estimate"
              )}
            </DataRow>
          </DataList>
        </Card>
      ) : null}

      {recommendation && !supplierDeclined ? (
        <RecommendationCard
          recommendation={recommendation}
          currency={quote?.currency ?? recommendation.normalized.currency}
        />
      ) : null}

      {awaitingDecision && recommendation ? (
        <DecisionPanel taskId={task.id} onDecided={load} />
      ) : null}

      {payments.length > 0 ? (
        <PaymentReceipt
          payments={payments}
          timeline={timeline.filter((event) => event.type.startsWith("payment."))}
        />
      ) : null}

      {readyForHandoff && recommendation && supplier?.contactChannelValue ? (
        <HandoffCard
          taskId={task.id}
          supplier={supplier}
          message={recommendation.orderMessage}
          quoteExpired={recommendation.quoteExpired}
          confirmedAt={handoffConfirmedAt}
          onConfirmed={load}
        />
      ) : null}

      {handoffConfirmedAt && view.proofline ? (
        <BuyerPickupPanel taskId={task.id} proofline={view.proofline} onChanged={load} />
      ) : null}

      <Card>
        <CardTitle>Activity</CardTitle>
        <ol className="mt-4 space-y-3">
          {timeline.map((event) => (
            <li key={event.id} className="flex gap-3 text-sm">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              <div>
                <p className="text-foreground">{EVENT_LABEL[event.type] ?? event.type}</p>
                <p className="text-xs text-subtle">{formatDateTime(event.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {handoffConfirmedAt || task.status === "FAILED" || buyerDeclined ? (
        <FeedbackForm taskId={task.id} existing={view.feedback.length > 0} />
      ) : null}
    </div>
  );
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function RecommendationCard({
  recommendation,
  currency,
}: {
  recommendation: NonNullable<TaskViewDto["recommendation"]>;
  currency: string;
}) {
  const n = recommendation.normalized;
  const total =
    n.totalMax != null
      ? `${money(currency, n.totalMin)} – ${money(currency, n.totalMax)}`
      : money(currency, n.totalMin);
  const unit =
    n.unitPriceMin != null
      ? n.unitPriceMax != null
        ? `${money(currency, n.unitPriceMin)} – ${money(currency, n.unitPriceMax)}`
        : money(currency, n.unitPriceMin)
      : null;

  return (
    <Card className="space-y-4">
      <CardTitle>Intra&apos;s read of this quote</CardTitle>

      <DataList>
        <DataRow label="Total incl. delivery">{total}</DataRow>
        {unit ? (
          <DataRow label="Per flyer" hint={n.quantity ? `for ${n.quantity} copies` : undefined}>
            {unit}
          </DataRow>
        ) : null}
        <DataRow label="Turnaround">{n.turnaround.label}</DataRow>
      </DataList>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Why this looks OK</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {recommendation.reasoning.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">
          What Intra cannot confirm
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {recommendation.uncertainties.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <Callout tone="unavailable">{recommendation.verificationNote}</Callout>
    </Card>
  );
}

function DecisionPanel({ taskId, onDecided }: { taskId: string; onDecided: () => void }) {
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<null | "ACCEPT" | "DECLINE">(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "ACCEPT" | "DECLINE") {
    setPending(decision);
    setError(null);
    try {
      await apiRequest(`/api/tasks/${taskId}/decision`, {
        method: "POST",
        sessionId: getSessionId(),
        body: {
          decision,
          reason: decision === "DECLINE" && reason.trim() ? reason.trim() : undefined,
        },
      });
      onDecided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record your choice. Try again.");
      setPending(null);
    }
  }

  return (
    <Card className="space-y-4">
      <CardTitle>Your choice</CardTitle>
      <p className="text-sm text-muted">
        This is your decision. Intra does not place the order or pay the printer — if you proceed,
        you send the message yourself and agree the order directly.
      </p>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button pending={pending === "ACCEPT"} onClick={() => decide("ACCEPT")}>
            Proceed with this printer
          </Button>
          <Button variant="secondary" onClick={() => setMode("declining")}>
            Not this one
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <label htmlFor="decline-reason" className="text-sm font-medium">
            Why not? <span className="text-subtle">(optional, helps us improve the route)</span>
          </label>
          <textarea
            id="decline-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-sm border border-border bg-bg px-3 py-2.5 text-sm outline-none focus-visible:border-foreground"
            placeholder="e.g. too expensive, too slow, found another printer"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              pending={pending === "DECLINE"}
              onClick={() => decide("DECLINE")}
            >
              Confirm — don&apos;t proceed
            </Button>
            <Button variant="secondary" onClick={() => setMode("idle")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function networkLabel(network: string | null): string {
  if (!network) return "—";
  return CELO_X402_NETWORKS[network]?.label ?? network;
}

function explorerUrl(network: string | null, txHash: string | null): string | null {
  return network && txHash ? explorerTxUrl(network, txHash) : null;
}

function shortHash(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function PaymentReceipt({
  payments,
  timeline,
}: {
  payments: TaskViewDto["payments"];
  timeline: TaskViewDto["timeline"];
}) {
  const settled = payments.find((p) => p.status === "SETTLED");
  const primary = settled ?? payments[0];
  const tone =
    primary.status === "SETTLED"
      ? "active"
      : primary.status === "FAILED"
        ? "danger"
        : primary.status === "UNAVAILABLE" || primary.status === "NOT_REQUIRED"
          ? "neutral"
          : "pending";

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Agent service payment</CardTitle>
        <StatusPill tone={tone}>{primary.status.replace(/_/g, " ")}</StatusPill>
      </div>

      {primary.status === "SETTLED" && settled ? (
        <DataList>
          <DataRow label="Paid">
            {settled.amountAtomic ? Number(settled.amountAtomic) / 1e6 : "—"}{" "}
            {settled.assetSymbol ?? "USDC"}
            <span className="mt-0.5 block text-xs text-subtle">
              query fee only — never the customer order (max {formatMoney(primary.maxFeeUsd, "USD")}
              )
            </span>
          </DataRow>
          <DataRow label="Network">
            {networkLabel(settled.network)} · via {settled.provider ?? "x402"}
          </DataRow>
          <DataRow label="Transaction">
            {settled.txHash ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{shortHash(settled.txHash)}</span>
                {explorerUrl(settled.network, settled.txHash) ? (
                  <a
                    href={explorerUrl(settled.network, settled.txHash) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                  >
                    View on {settled.network === "eip155:42220" ? "Celoscan" : "explorer"}
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </DataRow>
          {settled.attributionTag ? (
            <DataRow label="Attribution tag">
              <span className="font-mono text-xs">{settled.attributionTag}</span>
            </DataRow>
          ) : null}
          {settled.settledAt ? (
            <DataRow label="Settled">{formatDateTime(settled.settledAt)}</DataRow>
          ) : null}
        </DataList>
      ) : null}

      {primary.status === "FAILED" ? (
        <Callout tone="warning" title="The query-fee payment did not go through">
          {primary.errorCode ? `Reason: ${primary.errorCode}. ` : ""}No transaction was made and no
          receipt exists.
        </Callout>
      ) : null}

      {primary.status === "UNAVAILABLE" ? (
        <Callout tone="unavailable">
          Celo x402 / cPay verification is not available, so no service fee was charged and no
          receipt exists. Intra never fabricates a payment.
        </Callout>
      ) : null}

      {primary.status === "NOT_REQUIRED" ? (
        <Callout tone="unavailable">
          No agent query fee applies — this request came through the web, not a paid agent API call.
          Nothing was charged.
        </Callout>
      ) : null}

      {primary.status === "AUTHORISED" ? (
        <Callout tone="warning" title="Settlement outcome is being reconciled">
          The query-fee payment was authorised but the on-chain settlement could not be confirmed.
          It is not shown as paid until a verified transaction hash exists.
        </Callout>
      ) : null}

      {timeline.length > 0 ? (
        <ol className="space-y-1.5 border-t border-border pt-3 text-xs text-subtle">
          {timeline.map((event) => (
            <li key={event.id}>
              {EVENT_LABEL[event.type] ?? event.type} · {formatDateTime(event.createdAt)}
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}

function HandoffCard({
  taskId,
  supplier,
  message,
  quoteExpired,
  confirmedAt,
  onConfirmed,
}: {
  taskId: string;
  supplier: NonNullable<TaskViewDto["supplier"]>;
  message: string;
  quoteExpired: boolean;
  confirmedAt: string | null;
  onConfirmed: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const contactValue = supplier.contactChannelValue ?? "";
  const waHref =
    supplier.contactChannelType === "whatsapp" && contactValue
      ? `https://wa.me/${contactValue.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`
      : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function markSent() {
    setConfirming(true);
    setConfirmError(null);
    try {
      await apiRequest(`/api/tasks/${taskId}/handoff-confirm`, {
        method: "POST",
        sessionId: getSessionId(),
        body: {},
      });
      onConfirmed();
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : "Could not record that. Try again.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare aria-hidden className="size-5 text-primary" />
        <CardTitle>Order handoff — you send this yourself</CardTitle>
      </div>
      <p className="text-sm text-muted">
        You chose to proceed with this printer. Send them the message below to agree the order.
      </p>
      {quoteExpired ? (
        <Callout tone="warning" title="The quote had expired when you accepted it">
          Ask the printer to reconfirm the current price and turnaround before you pay. The message
          below already says this.
        </Callout>
      ) : null}
      <DataList>
        <DataRow label="Supplier">
          {supplier.name} · {supplier.city}, {supplier.country}
        </DataRow>
        <DataRow label="Contact">
          {supplier.contactChannelType} · {contactValue}
        </DataRow>
      </DataList>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Message to send</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-sm">
          {message}
        </pre>
      </div>

      <Callout tone="unavailable">
        Intra does not send this message and never pays a supplier for you. Review it, then send it
        and agree the final order directly with the printer.
      </Callout>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy aria-hidden className="size-4" />
          {copied ? "Copied" : "Copy message"}
        </Button>
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
          >
            Open in WhatsApp
            <ExternalLink aria-hidden className="size-4" />
          </a>
        ) : null}
      </div>

      <div className="border-t border-border pt-4">
        {confirmedAt ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 aria-hidden className="size-4" />
            You marked this as sent on {formatDateTime(confirmedAt)}.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              Once you have sent the message to the printer, let us know so we can ask how it went.
            </p>
            <Button size="sm" pending={confirming} onClick={markSent}>
              I&apos;ve sent this to the printer
            </Button>
            {confirmError ? (
              <p role="alert" className="text-xs text-danger">
                {confirmError}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

function FeedbackForm({ taskId, existing }: { taskId: string; existing: boolean }) {
  const [useful, setUseful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<"idle" | "pending" | "done" | "error">(
    existing ? "done" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  if (phase === "done") {
    return (
      <Callout tone="success" title="Thanks for the feedback">
        It helps us keep this printer&apos;s route accurate.
      </Callout>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (useful === null) {
      setError("Let us know if this was useful.");
      return;
    }
    setPhase("pending");
    setError(null);
    try {
      await apiRequest("/api/feedback", {
        method: "POST",
        body: { taskId, useful, comment: comment.trim() || undefined },
      });
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setError(err instanceof ApiError ? err.message : "Could not save your feedback.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-surface p-5">
      <CardTitle>Was this useful?</CardTitle>
      <div className="flex gap-2">
        {[
          { value: true, label: "Yes" },
          { value: false, label: "Not really" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={useful === option.value}
            onClick={() => setUseful(option.value)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              useful === option.value
                ? "border-primary bg-primary text-primary-contrast"
                : "border-border-strong text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Optional comment"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={3}
        placeholder="Anything the printer or Intra should know? (optional)"
        className="w-full rounded-sm border border-border bg-bg px-3 py-2.5 text-sm outline-none focus-visible:border-foreground"
      />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" pending={phase === "pending"}>
        Send feedback
      </Button>
    </form>
  );
}
