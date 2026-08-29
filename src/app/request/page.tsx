import type { Metadata } from "next";

import { RequestForm } from "@/features/tasks/RequestForm";

export const metadata: Metadata = { title: "Request" };

export default function RequestPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Buyer workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Get a printing quote without the back-and-forth
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Describe the job once. Intra makes it clear enough for an agent and a real printer to act
          on—then you approve the final order yourself.
        </p>
      </header>
      <RequestForm />
    </div>
  );
}
