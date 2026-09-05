import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Inbox } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { EmptyState } from "@/components/ui/States";
import { Card, CardTitle, SectionHeader } from "@/components/ui/Section";
import { getDb } from "@/lib/db/client";
import { formatMoney, relativeTime } from "@/lib/format";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import { MerchantFulfilmentPanel } from "@/features/proofline/MerchantFulfilmentPanel";
import { HandoverAttestPanel } from "@/features/attestation/HandoverAttestPanel";
import { ResumeSignal } from "@/features/pwa/ResumeSignal";
import { getSupplierWorkspace } from "@/features/routes/reads";
import { ChangePriceForm } from "@/features/supplier/ChangePriceForm";
import { QuoteResponseForm } from "@/features/supplier/QuoteResponseForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Incoming requests" };

/** Human labels for the structured brief keys the buyer flow captures. */
const BRIEF_LABEL: Record<string, string> = {
  size: "Paper size",
  quantity: "Quantity",
  colour: "Colour",
  deadline: "Needed by",
  deliveryArea: "Delivery / pick-up",
  pages: "Pages",
  copies: "Copies",
  device: "Device",
  fault: "Fault",
};

/** Present a brief value the way a person would say it, not the raw enum. */
function briefValue(key: string, value: unknown): string {
  const raw = String(value).trim();
  if (key === "colour") {
    const v = raw.toLowerCase().replace(/-/g, " ");
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  return raw;
}

function briefRows(brief: Record<string, unknown>) {
  return Object.entries(brief)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([key, value]) => ({
      label: BRIEF_LABEL[key] ?? key,
      value: briefValue(key, value),
    }));
}

export default async function SupplierRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; task?: string }>;
}) {
  const { slug } = await params;
  const { t, task: focusTaskId } = await searchParams;

  const db = await getDb();
  const canManage = t ? await manageTokenMatchesBusinessSlug(db, slug, t) : false;
  // This inbox is never a public surface — a wrong or missing manage token
  // must fail closed, the same as a buyer's own task page does, not fall
  // through to a "read-only" render of someone else's live customer briefs.
  if (!canManage) notFound();
  const workspace = await getSupplierWorkspace(db, slug, { includePickupCodes: canManage });
  if (!workspace) notFound();

  const { business, incoming, quoted, handedOff } = workspace;
  const suffix = t ? `?t=${t}` : "";

  // §8 — a notification may point at a request that has since moved on. Say so
  // rather than silently showing nothing.
  const staleNote =
    focusTaskId && !incoming.some((r) => r.task.id === focusTaskId)
      ? quoted.some((r) => r.task.id === focusTaskId)
        ? "That request now has your price on it — see “Prices you have sent” below."
        : handedOff.some((r) => r.task.id === focusTaskId)
          ? "That order has been handed off — see “Handed-off orders” below."
          : "That request is no longer waiting for a price. It may have been withdrawn or closed."
      : null;

  return (
    <div className="space-y-8">
      <ResumeSignal authQuery={t ? `businessSlug=${slug}&t=${t}` : undefined} />
      <SectionHeader
        eyebrow="Incoming requests"
        title={business.name}
        description="What customers have asked for, and what needs your response."
        actions={
          <Link
            href={`/supplier/${slug}${suffix}`}
            className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
          >
            Back to workspace
          </Link>
        }
      />

      {!canManage ? (
        <Callout tone="info" title="Read-only view">
          Open your manage link (from your Intra operator) to send quotes or decline requests.
        </Callout>
      ) : null}

      {staleNote ? <Callout tone="info">{staleNote}</Callout> : null}

      {incoming.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No customer requests yet"
          description="When someone needs one of your services, their request will appear here with everything they have told us about the job."
        />
      ) : (
        <ol className="space-y-6">
          {incoming.map(({ task, route }) => {
            const brief = (task.structuredInput ?? {}) as Record<string, unknown>;
            const focused = focusTaskId === task.id;
            return (
              <li key={task.id} id={`request-${task.id}`}>
                <Card as="article" className={`space-y-4 ${focused ? "ring-2 ring-primary" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle>Customer request</CardTitle>
                      <p className="text-sm text-muted">{route.name}</p>
                    </div>
                    <span className="text-xs text-muted">
                      Sent {relativeTime(task.submittedAt)} · reply within{" "}
                      {route.responseSlaMinutes} min
                    </span>
                  </div>

                  <DataList>
                    {briefRows(brief).map((row) => (
                      <DataRow key={row.label} label={row.label}>
                        {row.value}
                      </DataRow>
                    ))}
                    <DataRow label="Budget">Not specified</DataRow>
                  </DataList>

                  {canManage && t ? (
                    <QuoteResponseForm
                      routeId={route.id}
                      taskId={task.id}
                      manageToken={t}
                      currency={route.quoteCurrency}
                    />
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {quoted.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Prices you have sent</h2>
            <p className="text-sm text-muted">
              You can still change a price here. Once a customer has agreed one, they have to accept
              the change before it takes effect.
            </p>
          </div>
          <ol className="space-y-4">
            {quoted.map(({ task, route, quote, agreed, changePending }) => (
              <li key={task.id} id={`request-${task.id}`}>
                <Card
                  as="article"
                  className={`space-y-3 ${focusTaskId === task.id ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle>{route.name}</CardTitle>
                    <span className="text-xs text-muted">
                      {agreed ? "Customer agreed" : "Customer is reviewing your quote"}
                    </span>
                  </div>
                  <DataList>
                    <DataRow label="Your price">
                      {formatMoney(quote.amountMin, quote.currency)}
                    </DataRow>
                    <DataRow label="Turnaround">{quote.turnaround}</DataRow>
                    <DataRow label="Sent">{relativeTime(quote.createdAt)}</DataRow>
                  </DataList>

                  {changePending ? (
                    <Callout tone="info" title="Waiting on the customer">
                      You asked to change this price. The amount they agreed still stands until they
                      accept.
                    </Callout>
                  ) : canManage && t ? (
                    <ChangePriceForm
                      routeId={route.id}
                      taskId={task.id}
                      manageToken={t}
                      currency={quote.currency}
                      currentAmount={quote.amountMin}
                      alreadyAgreed={agreed}
                    />
                  ) : null}
                </Card>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {handedOff.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Handed-off orders</h2>
            <p className="text-sm text-muted">
              The buyer has sent their WhatsApp order. Optionally record the two Proofline
              fulfilment events — operational evidence only, never a payment or a guarantee.
            </p>
          </div>
          <ol className="space-y-6">
            {handedOff.map(({ task, route, proofline, handover }) => {
              const brief = (task.structuredInput ?? {}) as Record<string, unknown>;
              return (
                <li key={task.id} id={`request-${task.id}`}>
                  <Card
                    as="article"
                    className={`space-y-4 ${focusTaskId === task.id ? "ring-2 ring-primary" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle>Order for {route.name.toLowerCase()}</CardTitle>
                      <span className="text-xs text-muted">
                        Handed off {relativeTime(task.handoffConfirmedAt)}
                      </span>
                    </div>
                    <DataList>
                      {briefRows(brief).map((row) => (
                        <DataRow key={row.label} label={row.label}>
                          {row.value}
                        </DataRow>
                      ))}
                    </DataList>
                    {canManage && t ? (
                      <>
                        <MerchantFulfilmentPanel
                          taskId={task.id}
                          manageToken={t}
                          proofline={proofline}
                        />
                        <HandoverAttestPanel taskId={task.id} manageToken={t} handover={handover} />
                      </>
                    ) : (
                      <Callout tone="unavailable">{proofline.disclaimer}</Callout>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
