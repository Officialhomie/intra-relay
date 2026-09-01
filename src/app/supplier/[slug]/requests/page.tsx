import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Inbox } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { EmptyState } from "@/components/ui/States";
import { Card, CardTitle, SectionHeader } from "@/components/ui/Section";
import { getDb } from "@/lib/db/client";
import { formatDateTime, relativeTime } from "@/lib/format";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import { MerchantFulfilmentPanel } from "@/features/proofline/MerchantFulfilmentPanel";
import { getSupplierWorkspace } from "@/features/routes/reads";
import { QuoteResponseForm } from "@/features/supplier/QuoteResponseForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Incoming requests" };

export default async function SupplierRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;

  const db = await getDb();
  const canManage = t ? await manageTokenMatchesBusinessSlug(db, slug, t) : false;
  const workspace = await getSupplierWorkspace(db, slug, { includePickupCodes: canManage });
  if (!workspace) notFound();

  const { business, incoming, handedOff } = workspace;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Incoming requests"
        title={business.name}
        description="Structured flyer-printing requests waiting for your response."
        actions={
          <Link
            href={`/supplier/${slug}/review${t ? `?t=${t}` : ""}`}
            className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
          >
            Business review
          </Link>
        }
      />

      {!canManage ? (
        <Callout tone="info" title="Read-only view">
          Open your manage link (from your Intra operator) to send quotes or decline requests.
        </Callout>
      ) : null}

      {incoming.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests waiting"
          description="When a buyer sends a flyer-printing request to one of your active routes, it shows up here."
        />
      ) : (
        <ol className="space-y-6">
          {incoming.map(({ task, route }) => {
            const brief = (task.structuredInput ?? {}) as Record<string, unknown>;
            return (
              <li key={task.id}>
                <Card as="article" className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle>Request for {route.name.toLowerCase()}</CardTitle>
                    <span className="text-xs text-muted">
                      Sent {relativeTime(task.submittedAt)} · reply within{" "}
                      {route.responseSlaMinutes} min
                    </span>
                  </div>

                  <DataList>
                    {Object.entries(brief).map(([key, value]) => (
                      <DataRow key={key} label={key}>
                        {String(value)}
                      </DataRow>
                    ))}
                    <DataRow label="Received">{formatDateTime(task.submittedAt)}</DataRow>
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
            {handedOff.map(({ task, route, proofline }) => {
              const brief = (task.structuredInput ?? {}) as Record<string, unknown>;
              return (
                <li key={task.id}>
                  <Card as="article" className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle>Order for {route.name.toLowerCase()}</CardTitle>
                      <span className="text-xs text-muted">
                        Handed off {relativeTime(task.handoffConfirmedAt)}
                      </span>
                    </div>
                    <DataList>
                      {Object.entries(brief).map(([key, value]) => (
                        <DataRow key={key} label={key}>
                          {String(value)}
                        </DataRow>
                      ))}
                    </DataList>
                    {canManage && t ? (
                      <MerchantFulfilmentPanel
                        taskId={task.id}
                        manageToken={t}
                        proofline={proofline}
                      />
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
