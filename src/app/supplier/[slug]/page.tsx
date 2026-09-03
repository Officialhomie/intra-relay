import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowRight, Clock3, Inbox } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle, SectionHeader } from "@/components/ui/Section";
import { getDb } from "@/lib/db/client";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import {
  getBusinessValueSummary,
  nextActionForBusiness,
  valueHeadline,
} from "@/features/businesses/value";
import { describePricingForBusiness } from "@/features/pricing/model";
import { getSupplierWorkspace } from "@/features/routes/reads";
import { EditPublishedPriceForm } from "@/features/supplier/EditPublishedPriceForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your business" };

/**
 * The business's own overview — the answer to "what is this doing for me?".
 *
 * Every figure is counted from real rows. Where there is nothing yet, the page
 * says so plainly and explains what would put something there, rather than
 * showing a zero-filled dashboard or a projection (§7, §8).
 */
export default async function BusinessOverviewPage({
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
  const { business, routes, incoming, handedOff } = workspace;
  const summary = await getBusinessValueSummary(db, business.id);
  const nextAction = nextActionForBusiness({
    summary,
    waitingForQuote: incoming.length,
    awaitingHandover: handedOff.length,
  });
  const suffix = t ? `?t=${t}` : "";
  const liveServices = routes.filter((r) => r.status === "ACTIVE");

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Your business"
        title={business.name}
        description={`${business.city}, ${business.country}`}
      />

      <Card as="section" className="space-y-4">
        <p className="text-base leading-relaxed text-foreground">{valueHeadline(summary)}</p>
        {nextAction ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">{nextAction}</p>
            {incoming.length > 0 && canManage ? (
              <Link
                href={`/supplier/${slug}/requests${suffix}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-contrast hover:opacity-90"
              >
                Open requests
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>

      {summary.hasActivity ? (
        <section aria-labelledby="activity-heading" className="space-y-3">
          <h2 id="activity-heading" className="text-lg font-light tracking-tight">
            Your activity so far
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Requests received" value={summary.requestsReceived} />
            <Metric label="Prices sent" value={summary.quotesSent} />
            <Metric label="Customers who agreed" value={summary.jobsAgreed} />
            <Metric label="Jobs completed" value={summary.jobsCompleted} />
            <Metric
              label="Typical reply time"
              value={
                summary.medianResponseMinutes === null
                  ? "—"
                  : `${summary.medianResponseMinutes} min`
              }
              hint={summary.medianResponseMinutes === null ? "No priced replies yet" : undefined}
            />
            <Metric
              label="Requests you priced"
              value={summary.responseRate === null ? "—" : `${summary.responseRate}%`}
            />
          </dl>
          <p className="text-xs text-subtle">
            Counted from your own requests and orders. Nothing here is estimated.
          </p>
        </section>
      ) : (
        <Card as="section" className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox aria-hidden className="size-5 shrink-0 text-muted" />
            <CardTitle>No requests yet</CardTitle>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Once customers start asking for what you offer, you will see the requests you received,
            the prices you sent, and the jobs you completed here.
          </p>
        </Card>
      )}

      {summary.jobsCompleted > 0 ? (
        <Callout tone="success" title="Why finishing jobs here matters">
          Completed jobs can contribute to a verifiable history attached to your business. That
          record shows the jobs both sides confirmed — it is not a rating, and it does not vouch for
          the quality of the work.
        </Callout>
      ) : null}

      <section aria-labelledby="services-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="services-heading" className="text-lg font-light tracking-tight">
            What you offer
          </h2>
          <Link
            href={`/supplier/${slug}/review${suffix}`}
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            Service settings
          </Link>
        </div>

        {routes.length === 0 ? (
          <Card className="text-sm text-muted">
            You have not added a service yet. Your Intra operator can add your first one.
          </Card>
        ) : (
          <ul className="space-y-3">
            {routes.map((route) => (
              <li key={route.id}>
                <Card as="article" className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-foreground">{route.name}</p>
                    <span className="text-xs text-muted">
                      {route.status === "ACTIVE" ? "Available to customers" : "Not yet live"}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {describePricingForBusiness({
                      model: route.pricingModel,
                      published:
                        route.priceAmount !== null
                          ? {
                              amount: Number(route.priceAmount),
                              currency: route.quoteCurrency,
                              unit: route.priceUnit,
                            }
                          : null,
                    })}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-subtle">
                    <Clock3 aria-hidden className="size-3.5" />
                    You aim to reply within {route.responseSlaMinutes} minutes
                  </p>
                  {canManage && t ? (
                    <EditPublishedPriceForm
                      routeId={route.id}
                      manageToken={t}
                      currency={route.quoteCurrency}
                      model={route.pricingModel}
                      amount={route.priceAmount}
                      unit={route.priceUnit}
                    />
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}

        {liveServices.length === 0 && routes.length > 0 ? (
          <Callout tone="info" title="Nothing is live yet">
            Customers can only reach a service once an operator has checked your details and made it
            available.
          </Callout>
        ) : null}
      </section>

      {!canManage ? (
        <Callout tone="info" title="Read-only view">
          Open your manage link to send prices, mark work ready, or pause a service.
        </Callout>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <dd className="text-2xl font-medium tracking-tight text-foreground">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
