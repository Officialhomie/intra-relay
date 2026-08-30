import Link from "next/link";
import type { ReactNode } from "react";

import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  MessageCircle,
  Network,
  ShieldCheck,
} from "lucide-react";

const steps = [
  {
    number: "01",
    title: "A business chooses one service",
    body: "A printer, designer, or caterer starts with a template—not an API or an AI agent.",
  },
  {
    number: "02",
    title: "Intra creates a capability",
    body: "The business receives a structured quote route an agent can understand, with its terms and contact channel.",
  },
  {
    number: "03",
    title: "An agent asks, pays, and hands off",
    body: "Celo supports paid, verifiable information requests. The buyer always approves the final order.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-16 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface px-5 py-12 sm:px-10 sm:py-16">
        <div className="absolute -right-24 -top-24 size-80 rounded-full bg-primary-wash blur-3xl" />
        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium">
            <Network aria-hidden className="size-3.5 text-primary" /> Built for agent-ready African
            businesses
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Turn one real business service into a trusted, agent-ready capability.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Intra helps local businesses publish an accurate, structured route that any AI agent can
            request a quote from, pay for when appropriate, and hand back to a human for final
            approval.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/supplier/onboard"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-contrast transition-opacity hover:opacity-90"
            >
              Make my business agent-ready <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link
              href="/request"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-bg px-4 text-sm font-medium hover:bg-surface"
            >
              Try a buyer request
            </Link>
          </div>
          <p className="text-xs text-muted">
            No seed phrases. No private keys. No final customer payment without approval.
          </p>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <article key={step.number} className="rounded-xl border border-border p-5">
            <p className="font-mono text-xs text-primary">{step.number}</p>
            <h2 className="mt-5 text-lg font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-8 rounded-2xl border border-border p-5 sm:p-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <p className="text-sm font-medium text-primary">The product boundary</p>
          <h2 className="text-3xl font-semibold tracking-tight">
            Not another shopping agent. The business layer agents can trust.
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Consumer agents decide where users chat. Intra makes sure the business on the other side
            can respond with a clear capability, fresh quote, honest status, and safe payment
            terms—regardless of whether the agent lives in WhatsApp, Telegram, a web app, or an
            internal procurement tool.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-surface px-3 py-1.5">Channel-neutral</span>
            <span className="rounded-full bg-surface px-3 py-1.5">Merchant-controlled</span>
            <span className="rounded-full bg-surface px-3 py-1.5">Celo-ready</span>
            <span className="rounded-full bg-surface px-3 py-1.5">Human-approved orders</span>
          </div>
        </div>
        <div className="rounded-xl bg-surface p-5">
          <p className="text-sm font-medium">A capability card, not an MCP burden</p>
          <pre className="mt-4 overflow-x-auto text-xs leading-relaxed text-muted">{`{
  "business": "Campus Print Hub",
  "capability": "flyer-printing-quote",
  "asks_for": ["size", "quantity", "deadline"],
  "returns": ["price", "availability", "turnaround"],
  "payment": "Celo x402 when enabled",
  "final_order": "human approval required"
}`}</pre>
        </div>
      </section>
      <section className="space-y-5">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Trust is the feature</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Every agent answer needs a business control behind it.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Trust
            icon={<BadgeCheck aria-hidden />}
            title="Verified identity"
            text="A route is not public until the business, contact, consent, and public payout address are reviewed."
          />
          <Trust
            icon={<MessageCircle aria-hidden />}
            title="Human fallback"
            text="A merchant sees the full request and can confirm, decline, or pause the route."
          />
          <Trust
            icon={<CircleDollarSign aria-hidden />}
            title="Separate payments"
            text="A tiny paid query is never confused with the customer’s larger order payment."
          />
          <Trust
            icon={<ShieldCheck aria-hidden />}
            title="Receipts, not claims"
            text="Only facilitator-verified Celo settlement is shown as paid. No synthetic receipts."
          />
        </div>
      </section>
      <section className="rounded-2xl bg-primary p-6 text-primary-contrast sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="text-primary-contrast/75 flex items-center gap-2 text-sm">
              <Bot aria-hidden className="size-4" /> Hackathon MVP
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-primary-contrast">
              Start with printing. Prove agent-to-business commerce. Expand only after it works.
            </h2>
            <p className="text-primary-contrast/75 mt-3 max-w-2xl text-sm leading-relaxed">
              We are onboarding real businesses with a narrow, testable flyer-printing route.
              Design, catering, and delivery templates are prepared as drafts—not falsely presented
              as live.
            </p>
          </div>
          <Link
            href="/docs"
            className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-md bg-bg px-4 text-sm font-medium text-foreground hover:bg-surface"
          >
            Read the route contract <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Trust({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-xl border border-border p-4">
      <div className="text-primary">{icon}</div>
      <h3 className="mt-4 font-medium">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
    </article>
  );
}
