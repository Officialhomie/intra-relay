import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Code2, LockKeyhole, Route, WalletCards } from "lucide-react";

export const metadata: Metadata = { title: "Route contract" };
const manifest = `{
  "version": "0.1",
  "business": "campus-print-hub",
  "capability": "flyer-printing-quote",
  "endpoint": "/v1/campus-print-hub/flyer-printing/quote",
  "status": "ACTIVE",
  "input_schema": ["size", "quantity", "colour", "deadline", "deliveryArea"],
  "returns": ["quote", "valid_until", "turnaround", "availability"],
  "query_payment": { "protocol": "x402", "network": "eip155:42220", "asset": "USDC", "max_fee_usd": 0.05 },
  "final_order": { "approval_required": true, "channel": "whatsapp" }
}`;

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Agent route contract</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Businesses publish a capability. Agents handle the protocol.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Intra creates a managed route from a business&apos;s plain-language service details.
          Merchants never need to build or host MCP infrastructure themselves.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        <Card
          icon={<Route aria-hidden />}
          title="Capability"
          text="A single service with clear inputs, outputs, and a current operational status."
        />
        <Card
          icon={<WalletCards aria-hidden />}
          title="Payment boundary"
          text="A Celo x402 fee can pay for fresh information. It is not an order payment."
        />
        <Card
          icon={<LockKeyhole aria-hidden />}
          title="Control boundary"
          text="Routes can pause. Final orders always need human approval."
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Generated capability manifest</h2>
        <p className="text-sm text-muted">
          Illustrative contract only. This is not a live merchant endpoint or a settlement claim.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-border bg-surface p-4 text-xs leading-relaxed">
          {manifest}
        </pre>
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Agent lifecycle</h2>
        <ol className="space-y-3 text-sm">
          <Item number="01" title="Discover an active route">
            Agent reads the capability, freshness timestamp, supported inputs, and order-approval
            policy.
          </Item>
          <Item number="02" title="Validate the buyer brief">
            The agent sends only the required structured fields. A paused or stale route rejects the
            request before any payment is requested.
          </Item>
          <Item number="03" title="Pay only when enabled">
            The route returns HTTP 402. The agent retries with a signed X-PAYMENT authorisation; a
            server-side call to the official Celo facilitator verifies it and settles on-chain.
            Until the facilitator key is configured, Intra returns an explicit unavailable state.
          </Item>
          <Item number="04" title="Receive a time-bound quote">
            The result contains price, currency, availability, turnaround, assumptions, expiry, and
            merchant contact channel.
          </Item>
          <Item number="05" title="Hand the final order to a human">
            Intra prepares the WhatsApp message. The buyer reviews, sends, and pays any final order
            directly.
          </Item>
        </ol>
      </section>
      <section className="border-warning/25 rounded-xl border bg-warning-wash p-4 text-sm text-warning">
        <div className="flex gap-3">
          <Code2 aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Payment status</p>
            <p className="mt-1 leading-relaxed">
              The capability API, quote workflow, and the Celo x402 payment adapter are implemented
              and tested. Live settlement activates when the official facilitator API key is set in
              the server environment; until then a paid route returns an explicit unavailable state.
              No screenshot, preview, or database row is ever treated as a payment receipt — only a
              facilitator-verified transaction hash.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
function Card({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-xl border border-border p-4">
      <div className="text-primary">{icon}</div>
      <h2 className="mt-4 font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
    </article>
  );
}
function Item({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-3">
      <span className="font-mono text-xs text-primary">{number}</span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}
