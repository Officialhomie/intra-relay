import { Callout } from "@/components/ui/Callout";
import { shortenEvmAddress } from "@/lib/address";
import type { OnboardingDraft } from "./draft";

interface DraftRoutePreviewProps {
  draft: OnboardingDraft;
  onStartOver: () => void;
}

/**
 * Reviewable DRAFT quote route (FR-SUP-004, FR-SUP-005, AC-SUP-002, AC-SUP-003).
 * Explicitly not live and not accepting payment.
 */
export function DraftRoutePreview({ draft, onStartOver }: DraftRoutePreviewProps) {
  const { business, route, draftRouteUrl } = draft;

  return (
    <section aria-labelledby="draft-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="draft-heading" className="text-xl font-semibold tracking-tight">
          Draft created
        </h2>
        <p className="text-sm text-muted">
          Review the details below. Nothing is submitted or saved yet.
        </p>
      </div>

      <Callout tone="warning" title="This route is a draft — not live">
        It cannot receive a quote request or any payment. An operator must verify your details and
        consent before the route becomes public (
        <span className="font-mono text-xs">PENDING_VERIFICATION → ACTIVE</span>). You can ask an
        operator to pause the route at any time.
      </Callout>

      <dl className="divide-y divide-border rounded-md border border-border text-sm">
        <div className="flex justify-between gap-4 p-3">
          <dt className="text-muted">Business slug</dt>
          <dd className="font-mono">{business.slug}</dd>
        </div>
        <div className="flex justify-between gap-4 p-3">
          <dt className="text-muted">Draft route URL</dt>
          <dd className="break-all text-right font-mono text-xs">{draftRouteUrl}</dd>
        </div>
        <div className="flex justify-between gap-4 p-3">
          <dt className="text-muted">Service (query) fee</dt>
          <dd>${route.queryFeeUsd.toFixed(2)} per request</dd>
        </div>
        <div className="flex justify-between gap-4 p-3">
          <dt className="text-muted">Response SLA</dt>
          <dd>{route.responseSlaMinutes} minutes</dd>
        </div>
        <div className="flex justify-between gap-4 p-3">
          <dt className="text-muted">Quote currency</dt>
          <dd>{route.quoteCurrency}</dd>
        </div>
        <div className="flex justify-between gap-4 p-3">
          <dt className="text-muted">Payout address</dt>
          <dd className="font-mono text-xs">{shortenEvmAddress(business.payoutAddress)}</dd>
        </div>
        <div className="flex justify-between gap-4 p-3">
          <dt className="text-muted">Status</dt>
          <dd className="font-mono text-xs">{route.status}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Quote route inputs</h3>
        <ul className="space-y-1 text-sm text-muted">
          {route.inputFields.map((field) => (
            <li key={field.key}>
              <span className="text-foreground">{field.label}</span>
              {field.required ? " (required)" : " (optional)"} — e.g. {field.example}
            </li>
          ))}
        </ul>
      </div>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          View draft route payload
        </summary>
        <pre className="overflow-x-auto border-t border-border p-3 text-xs leading-relaxed">
          {JSON.stringify(draft.route, null, 2)}
        </pre>
      </details>

      <Callout tone="info">
        Demo only — this draft is shown for your review and is not stored anywhere.
      </Callout>

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
