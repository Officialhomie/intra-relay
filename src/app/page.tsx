import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowRight, BadgeCheck, Bot, MessageCircle, ShieldCheck } from "lucide-react";

const steps = [
  [
    "01",
    "Tell us what you need",
    "Describe a printing job in everyday language. No specialist terms required.",
  ],
  [
    "02",
    "Get a real response",
    "A verified business reviews the brief and sends an honest price and turnaround.",
  ],
  [
    "03",
    "Choose with confidence",
    "You approve the quote and send the final order yourself on WhatsApp.",
  ],
] as const;

export default function HomePage() {
  return (
    <div className="page-enter space-y-20 pb-4 sm:space-y-28">
      <section className="relative overflow-hidden rounded-lg border border-border bg-surface px-6 py-12 sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="bg-mist/40 absolute -right-24 -top-28 size-80 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="bg-sage/40 absolute bottom-0 left-[44%] size-48 rounded-full blur-3xl"
        />
        <div className="relative grid items-end gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="max-w-3xl">
            <p className="eyebrow mb-5">The trusted business layer for AI commerce</p>
            <h1 className="text-4xl font-normal tracking-tight sm:text-6xl lg:text-7xl">
              A clearer way to get work done with real local businesses.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Intra turns your request into a brief a real business can act on. You get a fresh
              quote, keep the final say, and never have to decode technical tools to begin.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/agent"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-primary px-5 text-sm font-medium text-primary-contrast transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                I need something made <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                href="/supplier/onboard"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-5 text-sm font-medium transition-colors hover:bg-surface-accent"
              >
                I run a business
              </Link>
            </div>
            <p className="mt-4 text-xs text-subtle">
              No wallets, no private keys, and no final order without your approval.
            </p>
          </div>
          <div className="bg-bg/75 rounded-md border border-border p-5 backdrop-blur-sm sm:p-6">
            <p className="eyebrow">A request, made simple</p>
            <p className="mt-4 font-serif text-2xl leading-snug">
              “I need 100 flyers for Friday. What will it cost?”
            </p>
            <div className="my-5 border-t border-border" />
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 size-4 text-success" aria-hidden />
                <span>
                  <strong>Verified business</strong>
                  <br />
                  <span className="text-muted">A real person responds to the brief.</span>
                </span>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 size-4 text-primary" aria-hidden />
                <span>
                  <strong>WhatsApp handoff</strong>
                  <br />
                  <span className="text-muted">You send the order when you are ready.</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-it-works">
        <div className="mb-8 max-w-xl">
          <p className="eyebrow">How it works</p>
          <h2 id="how-it-works" className="mt-3 text-3xl sm:text-4xl">
            One calm path from question to quote.
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
          {steps.map(([number, title, body]) => (
            <article key={number} className="interactive-card bg-surface p-6 sm:p-7">
              <p className="font-mono text-xs text-subtle">{number}</p>
              <h3 className="mt-10 text-xl font-medium tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <div>
          <p className="eyebrow">Built around real-world control</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">Helpful technology. Human decisions.</h2>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Intra makes information legible between agents and businesses. It does not pretend to be
            the business, make purchases for you, or hold your money.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Trust
            icon={<ShieldCheck aria-hidden className="size-5" />}
            title="You stay in control"
            text="No order is placed until you choose to send it."
          />
          <Trust
            icon={<BadgeCheck aria-hidden className="size-5" />}
            title="Businesses stay visible"
            text="A real business owns its availability and price."
          />
          <Trust
            icon={<Bot aria-hidden className="size-5" />}
            title="Agents get clarity"
            text="Structured requests replace guesswork and back-and-forth."
          />
        </div>
      </section>

      <section className="rounded-lg bg-primary px-6 py-10 text-primary-contrast sm:px-10 sm:py-12">
        <p className="eyebrow !text-primary-contrast/65">For business owners</p>
        <div className="mt-3 grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <h2 className="max-w-2xl text-3xl sm:text-4xl">
              Let customers find the service you already provide.
            </h2>
            <p className="text-primary-contrast/75 mt-3 max-w-xl text-sm leading-relaxed">
              Set up your first service in one screen. You review each request and keep the customer
              relationship direct.
            </p>
          </div>
          <Link
            href="/supplier/onboard"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-surface px-5 text-sm font-medium text-foreground transition-transform hover:-translate-y-0.5"
          >
            Set up my business <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Trust({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="interactive-card rounded-md border border-border bg-surface p-5">
      <div className="text-primary">{icon}</div>
      <h3 className="mt-6 font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
    </article>
  );
}
