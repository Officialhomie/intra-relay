import { BadgeCheck, EyeOff, Lock } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { shortenEvmAddress } from "@/lib/address";
import type { OnboardingDraft } from "./draft";

interface DraftRoutePreviewProps {
  draft: OnboardingDraft;
  onStartOver: () => void;
}

const LIFECYCLE = [
  { state: "Draft", meaning: "Your details only. Not saved, not visible to anyone." },
  {
    state: "Pending verification",
    meaning: "An operator is checking your contact, consent, and payout address.",
  },
  {
    state: "Active",
    meaning: "Live. Agents can request a quote and see your Capability Card and order contact.",
  },
  {
    state: "Paused",
    meaning: "You or an operator stopped it. No new requests until an operator reactivates it.",
  },
  {
    state: "Stale",
    meaning:
      "Still Active, but your price/availability is older than 14 days, so Intra treats it as unavailable until you reconfirm it.",
  },
] as const;

/**
 * Plain-language Capability Card preview (FR-SUP-004, FR-SUP-005, AC-SUP-002,
 * AC-SUP-003). Explicitly a draft: not live, not accepting payment, and only
 * public after human verification.
 */
export function DraftRoutePreview({ draft, onStartOver }: DraftRoutePreviewProps) {
  const { business, card, draftRouteUrl } = draft;

  return (
    <section aria-labelledby="draft-heading" className="space-y-5">
      <div className="space-y-1">
        <h2 id="draft-heading" className="text-xl font-semibold tracking-tight">
          Your Capability Card
        </h2>
        <p className="text-sm text-muted">
          This is what an AI agent would see once your service is active. Nothing is saved or
          submitted yet.
        </p>
      </div>

      <Callout tone="warning" title="Draft — not live">
        This route cannot receive a quote request or any payment. An operator must verify your
        details and consent before it becomes public. You can ask an operator to pause it at any
        time, in one tap.
      </Callout>

      <article className="space-y-4 rounded-md border border-border bg-surface p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Service</p>
          <p className="mt-1 font-medium text-foreground">{card.serviceName}</p>
          <p className="mt-1 text-sm text-muted">{card.whatItDoes}</p>
        </div>

        <dl className="divide-y divide-border rounded-md border border-border bg-bg text-sm">
          <Row label="Business">
            {business.name} · {business.category} · {business.location.city},{" "}
            {business.location.country}
          </Row>
          <Row label="Service area">{card.serviceArea}</Row>
          <Row label="Opening hours">{card.operatingHours}</Row>
          <Row label="Typical turnaround">{card.turnaround}</Row>
          <Row label="Quote response time">{card.quoteResponseExpectation}</Row>
          <Row label="Quote currency">{card.quoteCurrency}</Row>
          <Row label="Agent query fee">
            {card.queryFee.paid
              ? `About $${card.queryFee.amountUsd.toFixed(2)} per request`
              : "Free"}
          </Row>
          {card.queryFee.paid && business.payoutAddress ? (
            <Row label="Public payout address">
              <span className="font-mono text-xs">{shortenEvmAddress(business.payoutAddress)}</span>
            </Row>
          ) : null}
          <Row label="Status">Draft</Row>
        </dl>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">
            An agent must send
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {card.agentMustProvide.map((field) => (
              <li key={field.label}>
                <span className="text-foreground">{field.label}</span>
                {field.required ? " (required)" : " (optional)"} — e.g. {field.example}
              </li>
            ))}
          </ul>
        </div>
      </article>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-md border border-border p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <BadgeCheck aria-hidden className="size-4 text-success" />
            Public to agents once active
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            {card.publicToAgents.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-md border border-border p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <EyeOff aria-hidden className="size-4 text-muted" />
            Stays private
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            {card.notPublic.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-md border border-border p-4">
        <p className="text-sm font-medium text-foreground">What the service states mean</p>
        <dl className="mt-2 space-y-1.5 text-xs">
          {LIFECYCLE.map((item) => (
            <div key={item.state} className="sm:flex sm:gap-3">
              <dt className="font-medium text-foreground sm:w-40 sm:shrink-0">{item.state}</dt>
              <dd className="text-muted">{item.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Callout tone="info" title="This is not an AI agent">
        Onboarding does not give your business an AI agent, an MCP server, or automated order
        acceptance. Intra publishes a structured Capability Card and relays a request; you send
        every quote and the customer approves and pays for every order directly.
      </Callout>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Lock aria-hidden className="size-4 text-muted" />
          Next step
        </p>
        <p className="text-muted">
          Send these answers to your Intra operator. They create the business and route, verify your
          details, and only then activate it. Your review link will be{" "}
          <span className="break-all font-mono text-xs">{draftRouteUrl}</span>.
        </p>
      </div>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          View the raw route payload (for your operator)
        </summary>
        <pre className="overflow-x-auto border-t border-border p-3 text-xs leading-relaxed">
          {JSON.stringify(draft.route, null, 2)}
        </pre>
      </details>

      <button
        type="button"
        onClick={onStartOver}
        className="text-sm text-muted underline hover:text-foreground"
      >
        Start over
      </button>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 p-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}
