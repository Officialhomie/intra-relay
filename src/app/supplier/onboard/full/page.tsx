import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/ui/Callout";
import { OnboardingForm } from "@/features/businesses/OnboardingForm";

export const metadata: Metadata = {
  title: "Full supplier onboarding",
  description:
    "The detailed, operator-assisted onboarding: it produces a reviewable draft capability card rather than creating the business directly.",
};

/**
 * The long form. Most businesses should use the one-screen setup instead; this
 * exists for the operator-assisted path, where every detail is captured up
 * front and reviewed as a draft before anything is created.
 */
export default function FullOnboardingPage() {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Full onboarding</h1>
        <p className="text-sm text-muted">
          The detailed version, normally filled in with an Intra operator. It builds a draft you can
          review before anything goes live. Most businesses are better served by the{" "}
          <Link href="/supplier/onboard" className="text-primary underline underline-offset-2">
            one-screen setup
          </Link>
          .
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
