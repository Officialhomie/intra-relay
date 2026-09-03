import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">For businesses</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Get found by customers who already need what you do
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Customers describe a job; Intra brings it to businesses that can do it. You send your
          price, they decide, and you deal with them directly. Setup takes one screen.
        </p>
      </header>

      <section aria-labelledby="why-heading" className="space-y-3">
        <h2 id="why-heading" className="sr-only">
          Why businesses use Intra
        </h2>
        <ul className="space-y-2.5">
          {WHY_BUSINESSES_JOIN.map((reason) => (
            <li key={reason.title} className="rounded-md border border-border bg-surface p-4">
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
