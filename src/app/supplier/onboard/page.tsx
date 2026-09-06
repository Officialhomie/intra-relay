import type { Metadata } from "next";
import Link from "next/link";

import { CheckCircle2 } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { QuickStartForm } from "@/features/businesses/QuickStartForm";
import { WHY_BUSINESSES_JOIN } from "@/features/businesses/quick-start";

export const metadata: Metadata = {
  title: "Set up your business",
  description:
    "Get your business set up on Intra in one screen: what you do, what you charge, and how customers reach you.",
};

/**
 * The business's front door.
 *
 * The value proposition lives here, in the flow itself, rather than on a
 * separate marketing page — a business should understand why to bother before
 * it answers the first question (§8).
 */
export default function SupplierOnboardPage() {
  return (
    <div className="page-enter mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">For business owners</p>
        <h1 className="text-3xl sm:text-4xl">Start where your customers already are.</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Tell Intra about one service you offer. We make it clear to customers and agents, while
          you keep control of every quote and conversation.
        </p>
      </header>

      <section
        className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3"
        aria-label="Setup overview"
      >
        {[
          ["01", "Add one service"],
          ["02", "Set your pricing"],
          ["03", "Receive requests"],
        ].map(([number, label]) => (
          <div key={number} className="bg-surface p-4">
            <p className="font-mono text-xs text-subtle">{number}</p>
            <p className="mt-4 text-sm font-medium">{label}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="why-heading" className="space-y-3">
        <h2 id="why-heading" className="sr-only">
          Why businesses use Intra
        </h2>
        <ul className="space-y-2.5">
          {WHY_BUSINESSES_JOIN.map((reason) => (
            <li
              key={reason.title}
              className="interactive-card rounded-md border border-border bg-surface p-4"
            >
              <CheckCircle2 aria-hidden className="mb-3 size-4 text-success" />
              <p className="text-sm font-medium text-foreground">{reason.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{reason.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <Callout tone="info" title="What we will never ask for">
        A seed phrase, private key, password, BVN, NIN, bank login, or card details. Intra never
        holds your money — customers pay you directly.
      </Callout>

      <QuickStartForm />

      <p className="text-xs text-subtle">
        Working with an Intra operator?{" "}
        <Link href="/supplier/onboard/full" className="underline underline-offset-2">
          Use the detailed form
        </Link>
        .
      </p>
    </div>
  );
}
