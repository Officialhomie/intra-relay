import type { Metadata } from "next";

import { ActionCentre } from "@/features/notifications/ActionCentre";
import { NotificationSettings } from "@/features/notifications/NotificationSettings";
import { BuyerWorkPanel } from "@/features/tasks/BuyerWorkPanel";

export const metadata: Metadata = { title: "Activity" };

/**
 * The buyer action centre (milestone 7 §3). Everything that has happened on the
 * person's requests, newest first, with what needs them separated out — and,
 * below it, the same grouped work list as the home so they can act even if a
 * notification was missed (§20).
 */
export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm leading-relaxed text-muted">
          What has happened on your requests, and what needs you.
        </p>
      </header>

      <ActionCentre heading="Notifications" />

      <NotificationSettings />

      <section className="border-t border-border pt-8">
        <BuyerWorkPanel />
      </section>
    </div>
  );
}
