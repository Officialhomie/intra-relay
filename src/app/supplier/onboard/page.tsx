import type { Metadata } from "next";

import { Callout } from "@/components/ui/Callout";
import { OnboardingForm } from "@/features/businesses/OnboardingForm";

export const metadata: Metadata = {
  title: "Supplier onboarding",
  description:
    "Guided onboarding for a campus printer to create their first agent-readable quote route on Intra.",
};

export default function SupplierOnboardPage() {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Supplier onboarding</h1>
        <p className="text-sm text-muted">
          Intra lets AI agents ask a structured question about your service — starting with flyer
          printing. A small query fee (if enabled) pays for the information, not for a
          customer&apos;s order. You see the full request, send a quote, and the customer approves
          any final order directly with you.
        </p>
      </header>

      <Callout tone="info" title="What we will never ask for">
        A seed phrase, private key, password, BVN, NIN, bank login, or card details. The only wallet
        detail we need is your <strong>public</strong> Celo address.
      </Callout>

      <OnboardingForm />
    </div>
  );
}
