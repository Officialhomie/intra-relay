"use client";

import { useState } from "react";

import { ExternalLink, Search } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { Disclosure } from "@/components/ui/Disclosure";
import { Card, CardTitle } from "@/components/ui/Section";
import { StatusPill, taskStatusLabel, taskStatusTone } from "@/components/ui/StatusPill";
import { ApiError, apiRequest } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { attestationModeLabel, consistencyLabel } from "@/features/evidence/labels";
import type { TransactionTrace } from "@/features/evidence/trace";

/**
 * Operator/judge evidence lookup (M9 §14). Enter a task id, get the full
 * cross-referenced trace — DB state, on-chain references, and a consistency
 * cross-check — without hand-joining anything. Not a buyer/business surface.
 */
export function EvidencePanel({ operatorKey }: { operatorKey: string }) {
  const [taskId, setTaskId] = useState("");
  const [trace, setTrace] = useState<TransactionTrace | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    const id = taskId.trim();
    if (!id) return;
    setPending(true);
    setError(null);
    try {
      setTrace(
        await apiRequest<TransactionTrace>(`/api/operator/evidence/${encodeURIComponent(id)}`, {
          operatorKey,
        }),
      );
    } catch (err) {
      setTrace(null);
      setError(err instanceof ApiError ? err.message : "Lookup failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
        className="flex gap-2"
      >
        <input
          aria-label="Task id"
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          placeholder="task id"
          className="min-h-9 flex-1 rounded-sm border border-border bg-bg px-3 font-mono text-sm outline-none focus-visible:border-foreground"
        />
        <Button type="submit" size="sm" pending={pending}>
          <Search aria-hidden className="mr-1 size-4" />
          Trace
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {trace ? <TraceView trace={trace} /> : null}
    </div>
  );
}

function Ref({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  if (!value) return <DataRow label={label}>—</DataRow>;
  return (
    <DataRow label={label}>
      <span className="break-all font-mono text-xs">{value}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="ml-1.5 inline-flex items-center text-primary underline"
        >
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </DataRow>
  );
}

/**
 * The plain-language read of the trace — what happened, and whether the
 * evidence is real or simulated. Every line traces to a field also shown,
 * verbatim, in the technical detail below (frontend audit Priority 5).
 */
function evidenceSummaryLines(trace: TransactionTrace): string[] {
  const lines: string[] = [];

  if (trace.commitment) {
    lines.push(
      trace.commitment.attestationMode === "mock"
        ? "The order commitment has a demo attestation — simulated, not written on-chain."
        : "The order commitment was attested on-chain.",
    );
  } else {
    lines.push("No commitment attestation has been recorded for this request yet.");
  }

  if (trace.handover) {
    lines.push(
      trace.handover.signedByProvider
        ? "The handover was signed by the business and relayed on-chain."
        : trace.handover.attestationMode === "mock"
          ? "The handover has a demo attestation — simulated, not written on-chain."
          : "The handover has not been signed yet.",
    );
    if (trace.consistency.handoverReferencesCommitment === false) {
      lines.push(
        "The handover record does not reference the commitment above — this trace is inconsistent.",
      );
    }
  } else {
    lines.push("No handover attestation has been recorded for this request yet.");
  }

  return lines;
}

export function TraceView({ trace }: { trace: TransactionTrace }) {
  const c = trace.consistency;
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Evidence summary</CardTitle>
          <StatusPill tone={taskStatusTone(trace.task.status)}>
            {taskStatusLabel(trace.task.status)}
          </StatusPill>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {evidenceSummaryLines(trace).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </Card>

      {c.anySimulated ? (
        <Callout tone="warning" title="Contains simulated records">
          At least one attestation on this transaction is a local mock, not a real on-chain record.
        </Callout>
      ) : null}

      <Disclosure summary="Technical details">
        <div className="space-y-4">
          <Card className="space-y-3">
            <CardTitle>Transaction</CardTitle>
            <DataList>
              <Ref label="Task id" value={trace.task.id} />
              <DataRow label="Status">{taskStatusLabel(trace.task.status)}</DataRow>
              <DataRow label="Conversation">{trace.task.buyerSessionPrefix ?? "—"}</DataRow>
              <DataRow label="Buyer decision">
                {trace.task.buyerDecision ?? "—"}
                {trace.task.buyerDecidedAt ? ` · ${formatDateTime(trace.task.buyerDecidedAt)}` : ""}
              </DataRow>
              <DataRow label="Handoff confirmed">
                {trace.task.handoffConfirmedAt
                  ? formatDateTime(trace.task.handoffConfirmedAt)
                  : "—"}
              </DataRow>
            </DataList>
          </Card>

          {trace.provider ? (
            <Card className="space-y-3">
              <CardTitle>Provider</CardTitle>
              <DataList>
                <DataRow label="Business">{trace.provider.businessName}</DataRow>
                <DataRow label="Route">{trace.provider.routeName ?? "—"}</DataRow>
                <Ref
                  label="Payout address"
                  value={trace.provider.payoutAddress}
                  href={trace.provider.payoutAddressExplorer}
                />
                <DataRow label="Agent id (ERC-8004)">{trace.provider.providerAgentId}</DataRow>
              </DataList>
            </Card>
          ) : null}

          {trace.commitment ? (
            <Card className="space-y-3">
              <CardTitle>Commitment attestation (signed by Intra)</CardTitle>
              <DataList>
                <DataRow label="Status">{trace.commitment.status}</DataRow>
                <Ref label="Job ref" value={trace.commitment.jobRef} />
                <Ref label="Buyer address" value={trace.commitment.buyerAddress} />
                <DataRow label="Amount">
                  {trace.commitment.amountMinor} ({trace.commitment.currency})
                </DataRow>
                <Ref label="Schema UID" value={trace.commitment.schemaUid} />
                <Ref
                  label="Attestation UID"
                  value={trace.commitment.attestationUid}
                  href={trace.commitment.attestationUidExplorer}
                />
                <Ref
                  label="Transaction"
                  value={trace.commitment.attestationTxHash}
                  href={trace.commitment.attestationTxExplorer}
                />
                <DataRow label="Mode">
                  {attestationModeLabel(trace.commitment.attestationMode)}
                </DataRow>
                <DataRow label="Attested at">
                  {trace.commitment.attestedAt ? formatDateTime(trace.commitment.attestedAt) : "—"}
                </DataRow>
              </DataList>
            </Card>
          ) : null}

          {trace.handover ? (
            <Card className="space-y-3">
              <CardTitle>Handover attestation (signed by the provider)</CardTitle>
              <DataList>
                <DataRow label="Status">{trace.handover.status}</DataRow>
                <DataRow label="Provider signature">
                  {trace.handover.signedByProvider
                    ? "Verified merchant signature, relayed on-chain"
                    : attestationModeLabel(trace.handover.attestationMode)}
                </DataRow>
                <DataRow label="Outcome">{trace.handover.outcome ?? "—"}</DataRow>
                <DataRow label="Fulfilled at">
                  {trace.handover.fulfilledAt ? formatDateTime(trace.handover.fulfilledAt) : "—"}
                </DataRow>
                <Ref label="Attester address" value={trace.handover.attesterAddress} />
                <Ref label="Schema UID" value={trace.handover.schemaUid} />
                <Ref label="Refers to (commitment UID)" value={trace.handover.refUid} />
                <Ref
                  label="Attestation UID"
                  value={trace.handover.attestationUid}
                  href={trace.handover.attestationUidExplorer}
                />
                <Ref
                  label="Transaction"
                  value={trace.handover.attestationTxHash}
                  href={trace.handover.attestationTxExplorer}
                />
              </DataList>
            </Card>
          ) : null}

          {trace.payments.length > 0 ? (
            <Card className="space-y-3">
              <CardTitle>Service payments</CardTitle>
              {trace.payments.map((p, i) => (
                <DataList key={i}>
                  <DataRow label="Status">{p.status}</DataRow>
                  <DataRow label="Amount">
                    {p.amountAtomic ?? "—"} {p.asset ?? ""}
                  </DataRow>
                  <Ref label="Payee" value={p.payee} />
                  <Ref label="Transaction" value={p.txHash} href={p.txExplorer} />
                </DataList>
              ))}
            </Card>
          ) : null}

          <Card className="space-y-3">
            <CardTitle>Consistency cross-check</CardTitle>
            <DataList>
              <DataRow label="Commitment attested">{c.commitmentAttested ? "Yes" : "No"}</DataRow>
              <DataRow label="Handover attested">{c.handoverAttested ? "Yes" : "No"}</DataRow>
              <DataRow label="Handover links to commitment">
                {consistencyLabel(
                  c.handoverReferencesCommitment,
                  "No — does not reference the commitment shown above",
                )}
              </DataRow>
              <DataRow label="Any simulated record">{c.anySimulated ? "Yes" : "No"}</DataRow>
            </DataList>
          </Card>

          {trace.timeline.length > 0 ? (
            <Card className="space-y-2">
              <CardTitle>Timeline</CardTitle>
              <ol className="space-y-1 text-xs text-muted">
                {trace.timeline.map((event, i) => (
                  <li key={i} className="font-mono">
                    {event.at} · {event.type}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>
      </Disclosure>

      <Callout tone="unavailable">{trace.disclaimer}</Callout>
    </div>
  );
}
