import type { Metadata } from "next";

import { ConversationView } from "@/features/agent/console/ConversationView";

export const metadata: Metadata = { title: "Home" };

/**
 * The buyer workspace (frontend audit Priority 7 — Agent Workspace direction).
 *
 * `/agent` is where a person works with the agent on one thing at a time —
 * not a landing page introducing Intra. `ConversationView` owns the entire
 * surface, including its own heading, so this page is a thin shell. Request
 * history and management live at `/requests`, reached through the persistent
 * nav — not duplicated here.
 */
export default function BuyerHomePage() {
  return (
    <div className="page-enter mx-auto max-w-2xl space-y-6 sm:space-y-10">
      <ConversationView />
    </div>
  );
}
