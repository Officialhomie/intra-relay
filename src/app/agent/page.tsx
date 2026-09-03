import type { Metadata } from "next";

import { ConversationView } from "@/features/agent/console/ConversationView";

export const metadata: Metadata = { title: "Ask Intra" };

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Intra</p>
        <h1 className="text-3xl font-semibold tracking-tight">What do you need?</h1>
        <p className="text-sm leading-relaxed text-muted">
          Talk to me like a person. If you&apos;re after something a real business can do, I&apos;ll
          find one, get a real price and let you decide. Nothing is ordered and no money moves
          without you.
        </p>
      </header>
      <ConversationView />
    </div>
  );
}
