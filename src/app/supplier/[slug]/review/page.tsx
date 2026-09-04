import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BadgeCheck, Clock3, ShieldQuestion } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { Card, CardTitle, SectionHeader } from "@/components/ui/Section";
import { StatusPill, routeStatusLabel, routeStatusTone } from "@/components/ui/StatusPill";
import { getDb } from "@/lib/db/client";
import { shortenEvmAddress } from "@/lib/address";
import { formatDateTime, relativeTime } from "@/lib/format";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import { PRICE_FRESHNESS_MAX_AGE_DAYS, routeFreshness } from "@/features/routes/freshness";
import { getSupplierWorkspace } from "@/features/routes/reads";
import { PauseRouteButton } from "@/features/supplier/PauseRouteButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business review" };

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  phone: "Phone",
};

export default async function SupplierReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;

  const db = await getDb();
  const workspace = await getSupplierWorkspace(db, slug);
  if (!workspace) notFound();

  const canManage = t ? await manageTokenMatchesBusinessSlug(db, slug, t) : false;
  const { business, routes } = workspace;
  const addressVerified = business.verifiedByOperatorAt !== null;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Supplier review"
        title={business.name}
        description={`${business.city}, ${business.country} · ${business.category}`}
        actions={
          canManage ? (
            <Link
              href={`/supplier/${slug}/requests?t=${t}`}
              className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface"
            >
              Incoming requests
            </Link>
          ) : undefined
        }
      />

      {canManage ? (
        <Callout tone="success" title="You can manage this business">
          This link carries your private manage token. Keep it to yourself — it is not a wallet key
          and holds no funds, but it lets you pause your routes.
        </Callout>
      ) : (
        <Callout tone="info" title="Read-only view">
          Ask your Intra operator for your manage link to pause a route or respond to requests.
        </Callout>
      )}

      <Card>
        <CardTitle>Business details</CardTitle>
        <DataList className="mt-4">
          <DataRow label="Authorised contact">{business.contactName}</DataRow>
          <DataRow label="Order channel">
            {CHANNEL_LABEL[business.contactChannelType] ?? business.contactChannelType} ·{" "}
            {business.contactChannelValue}
          </DataRow>
          <DataRow label="Quote currency">{business.quoteCurrency}</DataRow>
          <DataRow
            label="Public payout address"
            hint="Public address only — Intra never stores or asks for a private key or seed phrase."
          >
            <span className="font-mono text-xs">{shortenEvmAddress(business.payoutAddress)}</span>
          </DataRow>
          <DataRow label="Quote-display consent">
            {business.consentAt ? `Recorded ${formatDateTime(business.consentAt)}` : "Not recorded"}
          </DataRow>
          <DataRow label="Payout-address verification">
            {addressVerified ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <BadgeCheck aria-hidden className="size-4" />
                Verified by operator {relativeTime(business.verifiedByOperatorAt)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <ShieldQuestion aria-hidden className="size-4" />
                Pending operator verification
              </span>
            )}
          </DataRow>
        </DataList>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-light tracking-tight">Capability routes</h2>

        <Card className="text-xs text-muted">
          <p className="text-sm font-medium text-foreground">What each state means</p>
          <dl className="mt-2 space-y-1.5">
            <StateRow state="Draft">Being prepared. Not visible to anyone.</StateRow>
            <StateRow state="Pending verification">
              An operator is checking your details before it can go live.
            </StateRow>
            <StateRow state="Active">
              Live. Agents can request a quote and see your Capability Card and order contact.
            </StateRow>
            <StateRow state="Paused">
              Stopped by you or an operator. No new requests until an operator reactivates it.
            </StateRow>
            <StateRow state="Stale">
              Still Active, but your price/availability is older than {PRICE_FRESHNESS_MAX_AGE_DAYS}{" "}
              days, so Intra treats it as unavailable until you reconfirm it with your operator.
            </StateRow>
          </dl>
        </Card>

        {routes.length === 0 ? (
          <Card className="text-sm text-muted">No routes yet for this business.</Card>
        ) : (
          routes.map((route) => {
            const fields = Array.isArray(route.inputSchema) ? route.inputSchema : [];
            const fresh = routeFreshness(route);
            const stale = route.status === "ACTIVE" && fresh.stale;
            return (
              <Card key={route.id} as="article" className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{route.name}</CardTitle>
                    <p className="mt-1 max-w-prose text-sm text-muted">{route.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill tone={routeStatusTone(route.status)}>
                      {routeStatusLabel(route.status)}
                    </StatusPill>
                    {stale ? <StatusPill tone="warning">Stale</StatusPill> : null}
                  </div>
                </div>

                {stale ? (
                  <Callout tone="warning" title="Price data is stale">
                    This route is Active but its price/availability has not been confirmed in{" "}
                    {PRICE_FRESHNESS_MAX_AGE_DAYS} days. Agents cannot request a quote until an
                    operator reconfirms it.
                  </Callout>
                ) : null}

                <DataList>
                  <DataRow label="Query fee">
                    {Number(route.queryFeeUsd) > 0
                      ? `$${Number(route.queryFeeUsd).toFixed(2)} per request`
                      : "Free (no agent query fee)"}
                  </DataRow>
                  <DataRow label="Response SLA">{route.responseSlaMinutes} minutes</DataRow>
                  <DataRow label="Agent endpoint">
                    <span className="font-mono text-xs">{route.endpoint}</span>
                  </DataRow>
                  <DataRow label="Price freshness">
                    {route.priceUpdatedAt ? (
                      <span
                        className={`inline-flex items-center gap-1.5 ${stale ? "text-warning" : ""}`}
                      >
                        <Clock3 aria-hidden className="size-4" />
                        Confirmed {relativeTime(route.priceUpdatedAt)}
                        {stale ? " · needs reconfirming" : ""}
                      </span>
                    ) : (
                      "Not yet confirmed"
                    )}
                  </DataRow>
                  <DataRow label="Verified for buyers">
                    {route.verifiedAt ? formatDateTime(route.verifiedAt) : "Not verified"}
                  </DataRow>
                </DataList>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                    What agents can see when this route is Active
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    <li>Your business name, category, and city/country.</li>
                    <li>This service, its description, and the details an agent must send:</li>
                  </ul>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {fields.map((field) => (
                      <li
                        key={field.key}
                        className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-muted"
                      >
                        {field.label}
                        {field.required ? "" : " (optional)"}
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    <li>Response SLA and whether a query fee applies.</li>
                    <li>
                      Your{" "}
                      {CHANNEL_LABEL[business.contactChannelType] ?? business.contactChannelType}{" "}
                      order contact — only while the route is Active, verified, and fresh.
                    </li>
                  </ul>
                </div>

                {canManage && t ? (
                  route.status === "ACTIVE" ? (
                    <PauseRouteButton routeId={route.id} manageToken={t} />
                  ) : (
                    <p className="text-xs text-muted">
                      This route is {routeStatusLabel(route.status).toLowerCase()}. An operator
                      controls activation; you can pause it once it is live.
                    </p>
                  )
                ) : null}
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}

function StateRow({ state, children }: { state: string; children: React.ReactNode }) {
  return (
    <div className="sm:flex sm:gap-3">
      <dt className="font-medium text-foreground sm:w-44 sm:shrink-0">{state}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}
