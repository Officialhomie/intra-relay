import type { Metadata } from "next";

import { RequestForm } from "@/features/tasks/RequestForm";

export const metadata: Metadata = { title: "Request" };

export default function RequestPage() {
  return (
    <div className="page-enter mx-auto max-w-xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Request a quote</p>
        <h1 className="text-3xl sm:text-4xl">Get a printing quote without the back-and-forth.</h1>
        <p className="text-sm leading-relaxed text-muted">
          Give us the important details once. A real printer reviews the brief, then you decide
          whether to send the final order.
        </p>
      </header>
      <RequestForm />
    </div>
  );
}
