import type { ReactNode } from "react";

import { KeyRound, ShieldCheck } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/Section";

/**
 * The one handover-code interaction, presented from whichever side is
 * looking at it (ADR-018, milestone 9; frontend audit Priority 6).
 *
 * The two sides are opposites, not variants of each other: the buyer only
 * ever DISPLAYS a code they already hold; the merchant only ever RECEIVES one
 * from the customer and checks it. That is why this stays one component with
 * two modes rather than two lookalike ones — the direction is the content,
 * not a theme applied on top of identical markup. Business logic (the wallet
 * signing flow, the API calls, the attestation state machine) stays entirely
 * in the caller; this owns only the direction-aware frame around it.
 */
type HandoverCodeCardProps =
  | {
      /** The buyer's own view: a code to present, nothing to do with it here. */
      mode: "buyer";
      code: string | null;
    }
  | {
      /** The merchant's view: someone else's code, and a place to check it. */
      mode: "merchant";
      children: ReactNode;
    };

export function HandoverCodeCard(props: HandoverCodeCardProps) {
  if (props.mode === "buyer") {
    if (!props.code) return null;
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-5 text-primary" />
          <CardTitle>Your collection code</CardTitle>
        </div>
        <p className="text-sm text-muted">
          Say this to the business when you collect your order — it&apos;s how the record shows you
          were really there.
        </p>
        <div className="rounded-md border border-border-strong bg-surface p-4 text-center">
          <p className="eyebrow mb-1.5">You present this</p>
          <p className="whitespace-nowrap font-mono text-3xl font-semibold tracking-[0.2em] text-foreground">
            {props.code}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-bg p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="size-4 text-primary" />
        <p className="text-sm font-medium">Customer&apos;s collection code</p>
      </div>
      <p className="text-sm text-muted">
        Ask the customer for their collection code, then confirm the handover below — this is
        recorded as part of the transaction history.
      </p>
      {props.children}
    </div>
  );
}
