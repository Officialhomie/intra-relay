import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowRight, Clock3, Inbox } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle, SectionHeader } from "@/components/ui/Section";
import { getDb } from "@/lib/db/client";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import { getBusinessValueSummary } from "@/features/businesses/value";
import { ActionCentre } from "@/features/notifications/ActionCentre";
import { NotificationSettings } from "@/features/notifications/NotificationSettings";
import { describePricingForBusiness } from "@/features/pricing/model";
import { PushPrompt } from "@/features/pwa/PushPrompt";
import { getSupplierWorkspace } from "@/features/routes/reads";
import { EditPublishedPriceForm } from "@/features/supplier/EditPublishedPriceForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your business" };

/**
 * The business workspace, action-first (milestone 7 §4, §21).
 *
 * It answers, in order: what needs me, what is happening, what have I done, is
 * this useful. Every figure is counted from real rows — where there is nothing
 * yet, it says so rather than showing a zero-filled dashboard.
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
  const { business, routes, incoming, quoted, handedOff } = workspace;
  const summary = await getBusinessValueSummary(db, business.id);
  const suffix = t ? `?t=${t}` : "";

  const reviewingQuote = quoted.filter((q) => !q.agreed && !q.changePending).length;
  const priceChangeWaiting = quoted.filter((q) => q.changePending).length;
  const inProgress = quoted.filter((q) => q.agreed).length;
  const toHandOver = handedOff.filter(
    (h) => h.proofline.evidenceStatus === "NOT_STARTED" || h.proofline.readyForPickupAt === null,
  ).length;

  const happening = reviewingQuote + inProgress + toHandOver;

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Your business"
        title={business.name}
        description={`${business.city}, ${business.country}`}
      />

      {canManage && t ? (
        <>
          {incoming.length > 0 || quoted.length > 0 ? (
            <PushPrompt
              reason="Customers are waiting on you."
              authQuery={`businessSlug=${slug}&t=${t}`}
            />
          ) : null}
          <ActionCentre authQuery={`businessSlug=${slug}&t=${t}`} heading="What needs you" />
        </>
      ) : (
        <Callout tone="info" title="Read-only view">
          Open your manage link to see what needs you, send prices, and mark work ready.
        </Callout>
      )}

      {canManage && incoming.length > 0 ? (
        <Link
          href={`/supplier/${slug}/requests${suffix}`}
          className="border-warning/40 bg-warning-wash/40 hover:border-warning/60 flex items-center justify-between gap-3 rounded-md border p-4 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Inbox aria-hidden className="size-4 text-warning" />
            {incoming.length} {incoming.length === 1 ? "customer is" : "customers are"} waiting for
            your price
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
        </Link>
      ) : null}

      <section aria-labelledby="happening-heading" className="space-y-3">
        <h2 id="happening-heading" className="text-lg font-light tracking-tight">
          What&apos;s happening
        </h2>
        {happening === 0 && incoming.length === 0 && priceChangeWaiting === 0 ? (
          <Card className="text-sm text-muted">
            Nothing is in flight right now. New requests will appear here and in your requests
            inbox.
          </Card>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Reviewing your quote" value={reviewingQuote} icon={Clock3} />
            <Stat label="Price change waiting" value={priceChangeWaiting} icon={Clock3} />
            <Stat label="In progress" value={inProgress} icon={Clock3} />
            <Stat label="To hand over" value={toHandOver} icon={Inbox} />
          </dl>
        )}
        {canManage ? (
          <Link
            href={`/supplier/${slug}/requests${suffix}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2"
          >
            Open your requests
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </section>

      {summary.hasActivity ? (
        <section aria-labelledby="activity-heading" className="space-y-3">
          <h2 id="activity-heading" className="text-lg font-light tracking-tight">
            Your record so far
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Requests received" value={summary.requestsReceived} />
            <Stat label="Prices sent" value={summary.quotesSent} />
            <Stat label="Customers who agreed" value={summary.jobsAgreed} />
            <Stat label="Jobs completed" value={summary.jobsCompleted} />
            <Stat
              label="Typical reply time"
              text={
                summary.medianResponseMinutes === null
                  ? "—"
                  : `${summary.medianResponseMinutes} min`
              }
            />
            <Stat
              label="Requests you priced"
              text={summary.responseRate === null ? "—" : `${summary.responseRate}%`}
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
            <CardTitle>No customer requests yet</CardTitle>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            When someone needs one of your services, their request will appear here and in your
            requests inbox — with everything they have told us about the job.
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
      </section>

      {canManage && t ? <NotificationSettings authQuery={`businessSlug=${slug}&t=${t}`} /> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  text,
  icon: Icon,
}: {
  label: string;
  value?: number;
  text?: string;
  icon?: typeof Clock3;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon aria-hidden className="size-3.5 text-subtle" /> : null}
        <span className="text-2xl font-medium tracking-tight text-foreground">
          {text ?? value ?? 0}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
