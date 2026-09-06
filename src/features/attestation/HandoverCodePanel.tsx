import { KeyRound } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/Section";

/**
 * Buyer-only. Shows the code the buyer says aloud at collection — the
 * "buyer -> merchant" half of the two-party handover attestation (ADR-018,
 * milestone 9). The code arrives on the buyer's own session-scoped task view;
 * this component only renders it.
 */
export function HandoverCodePanel({ code }: { code: string | null }) {
  if (!code) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound aria-hidden className="size-5 text-primary" />
        <CardTitle>Your handover code</CardTitle>
      </div>
      <p className="text-sm text-muted">
        Say this to the business when you collect your order — it&apos;s how the record shows you
        were really there.
      </p>
      <div className="rounded-md border border-border-strong bg-surface p-3 text-center">
        <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em]">{code}</p>
      </div>
    </Card>
  );
}
