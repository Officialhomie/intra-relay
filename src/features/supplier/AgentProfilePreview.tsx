import Link from "next/link";

import { ExternalLink, Eye, EyeOff } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle } from "@/components/ui/Section";
import { DataList, DataRow } from "@/components/ui/DataList";
import { StatusPill } from "@/components/ui/StatusPill";
import type { BusinessCapabilities } from "@/features/routes/capability";

/**
 * "How buyers find you" — the merchant's view of their agent-facing profile
 * (M10.2C).
 *
 * The `capabilities` prop is the SAME document `/v1/<slug>/capabilities`
 * serves to agents, produced by `buildBusinessCapabilities`. This component
 * only re-words it for a human: it never recomputes availability, pricing, or
 * contact exposure, so the merchant cannot be shown one thing while agents
 * read another. If the underlying rules change, this page changes with them.
 *
 * It also renders what is NOT published, because "my number is only given out
 * once my service is live" is the reassurance a merchant actually wants.
 */
export function AgentProfilePreview({
  capabilities,
  capabilitiesHref,
}: {
  capabilities: BusinessCapabilities;
  capabilitiesHref: string;
}) {
  const { business, routes } = capabilities;
  const live = routes.filter((r) => r.availability.state === "AVAILABLE");

  return (
    <section aria-labelledby="agent-profile-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="agent-profile-heading" className="text-lg font-light tracking-tight">
          How buyers find you
        </h2>
        <Link
          href={capabilitiesHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2"
        >
          View agent profile
          <ExternalLink aria-hidden className="size-3.5" />
        </Link>
      </div>

      <p className="max-w-prose text-sm text-muted">
        This is exactly what a customer&apos;s assistant reads when it looks for a business like
        yours. Nothing here is written separately for you — it is the same profile they receive.
      </p>

      {live.length === 0 ? (
        <Callout tone="info" title="Not yet visible to customers">
          None of your services are live yet, so assistants cannot find you or see your contact
          details. Your Intra operator activates a service once your details check out.
        </Callout>
      ) : null}

      <Card as="article" className="space-y-4">
        <div className="flex items-center gap-2">
          <Eye aria-hidden className="size-4 shrink-0 text-success" />
          <CardTitle>Published to customers and their assistants</CardTitle>
        </div>

        <DataList>
          <DataRow label="Business name">{business.name}</DataRow>
          <DataRow label="Where you work">
            {business.location.city}, {business.location.country}
          </DataRow>
          <DataRow label="What you do">{business.category}</DataRow>
          <DataRow label="Checked by an operator">
            {business.operatorVerified ? "Yes" : "Not yet"}
          </DataRow>
        </DataList>

        {routes.length === 0 ? (
          <p className="text-sm text-muted">No services published yet.</p>
        ) : (
          <ul className="space-y-3">
            {routes.map((route) => {
              const available = route.availability.state === "AVAILABLE";
              return (
                <li key={route.slug}>
                  <div className="space-y-2 rounded-md border border-border bg-bg p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-foreground">{route.name}</p>
                      <StatusPill tone={available ? "active" : "neutral"}>
                        {available ? "Customers can see this" : "Not shown yet"}
                      </StatusPill>
                    </div>
                    <p className="text-sm text-muted">{route.description}</p>
                    <DataList>
                      <DataRow label="Your price">{route.pricing.summary}</DataRow>
                      <DataRow label="How you price it">
                        {PRICING_MODEL_WORDS[route.pricing.model]}
                      </DataRow>
                      <DataRow label="Reply time you promise">
                        Within {route.quoteSla.responseWithinMinutes} minutes
                      </DataRow>
                      {route.orderContact ? (
                        <DataRow label="Order contact given out">
                          {route.orderContact.channel} · {route.orderContact.value}
                        </DataRow>
                      ) : (
                        <DataRow label="Order contact given out">
                          Not given out while this service is not live
                        </DataRow>
                      )}
                    </DataList>
                    {!available ? (
                      <p className="text-xs text-subtle">{route.availability.detail}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card as="article" className="space-y-3">
        <div className="flex items-center gap-2">
          <EyeOff aria-hidden className="size-4 shrink-0 text-muted" />
          <CardTitle>Kept private</CardTitle>
        </div>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>Your private manage link.</li>
          <li>Your own record — requests received, prices sent, reply times.</li>
          <li>Anything your Intra operator records while checking your details.</li>
          <li>
            Your order contact, until a service of yours is live — then it is given out only so a
            customer can send you their order themselves.
          </li>
        </ul>
      </Card>
    </section>
  );
}

/** The pricing model in the merchant's words, not the enum. */
const PRICING_MODEL_WORDS: Record<string, string> = {
  FIXED: "A set price",
  STARTING_FROM: "A starting price",
  QUOTE_REQUIRED: "You quote each job",
};
