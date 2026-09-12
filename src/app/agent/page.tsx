import type { Metadata } from "next";

import { ConversationView } from "@/features/agent/console/ConversationView";
import { BuyerWorkPanel } from "@/features/tasks/BuyerWorkPanel";

export const metadata: Metadata = { title: "Home" };

/**
 * The buyer home / workspace (milestone 7 §1, §2).
 *
 * "What do you need?" stays the dominant entry point. Below it, everything the
 * person already has on the go — read from persisted state, so they can leave
 * and come back without a notification and still find their work.
 */
export default function BuyerHomePage() {
  return (
    <div className="page-enter mx-auto max-w-2xl space-y-6 sm:space-y-10">
      <header className="space-y-2">
        <p className="eyebrow">Your workspace</p>
        <h1 className="text-2xl sm:text-4xl">What do you need?</h1>
        <p className="text-sm leading-relaxed text-muted">
          Describe it in your own words. We&apos;ll turn it into a clear request for a real
          business; you&apos;ll see the price before you decide what happens next.
        </p>
      </header>

      <ConversationView />

      <section className="border-t border-border pt-8">
        <h2 className="sr-only">Your work</h2>
        <BuyerWorkPanel />
      </section>
    </div>
  );
}
