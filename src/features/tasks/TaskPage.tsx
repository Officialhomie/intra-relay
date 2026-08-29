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

interface TaskViewDto {
  task: {
    id: string;
    status: string;
    structuredInput: Record<string, unknown> | null;
    failureReason: string | null;
    submittedAt: string | null;
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
    contactChannelType: string;
    contactChannelValue: string;
    city: string;
    country: string;
  } | null;
  quotes: {
    id: string;
    status: string;
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
  payments: { id: string; status: string; maxFeeUsd: string }[];
  recommendation: { rationale: string; orderMessage: string } | null;
  feedback: { id: string; useful: boolean; comment: string | null }[];
  timeline: { id: string; type: string; createdAt: string; data: Record<string, unknown> }[];
}

const EVENT_LABEL: Record<string, string> = {
  "task.created": "Request created",
  "task.submitted": "Request submitted",
  "task.awaiting_quote": "Sent to the printer",
  "payment.unavailable": "Agent service payment unavailable",
  "payment.pending": "Agent service payment pending",
  "quote.received": "Quote received",
  "quote.declined": "Printer declined",
  "recommendation.created": "Recommendation prepared",
  "task.handoff_ready": "Ready for your WhatsApp handoff",
  "task.failed": "Request could not be completed",
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

  const { task, route, supplier, quotes, payments, recommendation, timeline } = view;
  const quote = quotes[0] ?? null;
  const brief = task.structuredInput ?? {};
  const payment = payments[0] ?? null;
  const declined = quote?.status === "DECLINED";

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

      {quote && !declined ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>The quote</CardTitle>
            <span className="text-xs font-medium uppercase tracking-wide text-subtle">
              {quote.fixed ? "Fixed price" : "Estimate — confirm before paying"}
            </span>
          </div>
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
            <DataRow label="Quote expiry">
              {quote.expiresAt ? (
                isExpired(quote.expiresAt) ? (
                  <span className="text-warning">Expired {relativeTime(quote.expiresAt)}</span>
                ) : (
                  <span>
                    <Clock3 aria-hidden className="mr-1 inline size-3.5" />
                    {formatDateTime(quote.expiresAt)} ({relativeTime(quote.expiresAt)})
                  </span>
                )
              ) : (
                "No stated expiry — treat as an estimate"
              )}
            </DataRow>
          </DataList>
        </Card>
      ) : null}

      {payment ? (
        <Callout
          tone={payment.status === "UNAVAILABLE" ? "unavailable" : "info"}
          title="Agent service payment"
        >
          {payment.status === "UNAVAILABLE"
            ? `Status: UNAVAILABLE. Celo x402 / buy access is not configured, so no service fee was charged and no receipt exists. Intra never fabricates a payment.`
            : `Status: ${payment.status}. Cap ${formatMoney(payment.maxFeeUsd, "USD")}.`}
        </Callout>
      ) : null}

      {recommendation && supplier && !declined ? (
        <HandoffCard
          supplier={supplier}
          rationale={recommendation.rationale}
          message={recommendation.orderMessage}
        />
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

      {task.status === "HANDOFF_READY" || task.status === "FAILED" ? (
        <FeedbackForm taskId={task.id} existing={view.feedback.length > 0} />
      ) : null}
    </div>
  );
}

function HandoffCard({
  supplier,
  rationale,
  message,
}: {
  supplier: TaskViewDto["supplier"] & object;
  rationale: string;
  message: string;
}) {
  const [copied, setCopied] = useState(false);
  const waHref =
    supplier.contactChannelType === "whatsapp"
      ? `https://wa.me/${supplier.contactChannelValue.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`
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

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare aria-hidden className="size-5 text-primary" />
        <CardTitle>Order handoff — you send this yourself</CardTitle>
      </div>
      <p className="text-sm text-muted">{rationale}</p>
      <DataList>
        <DataRow label="Supplier">
          {supplier.name} · {supplier.city}, {supplier.country}
        </DataRow>
        <DataRow label="Contact">
          {supplier.contactChannelType} · {supplier.contactChannelValue}
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
