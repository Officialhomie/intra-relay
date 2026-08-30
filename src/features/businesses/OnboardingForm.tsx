"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { QUOTE_CURRENCIES } from "@/features/routes/schema";
import { getTemplateForCategory } from "@/features/routes/templates";
import { DraftRoutePreview } from "./DraftRoutePreview";
import { buildOnboardingDraft, type OnboardingDraft } from "./draft";
import {
  BUSINESS_CATEGORIES,
  CONTACT_CHANNEL_TYPES,
  businessOnboardingSchema,
  type BusinessOnboardingInput,
} from "./schema";

const CATEGORY_OPTIONS = BUSINESS_CATEGORIES.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
const CHANNEL_OPTIONS = CONTACT_CHANNEL_TYPES.map((value) => ({
  value,
  label: value === "whatsapp" ? "WhatsApp" : value[0].toUpperCase() + value.slice(1),
}));
const CURRENCY_OPTIONS = QUOTE_CURRENCIES.map((value) => ({ value, label: value }));
const DEFAULT_VALUES: BusinessOnboardingInput = {
  businessName: "",
  contactName: "",
  contactChannelType: "whatsapp",
  contactChannelValue: "",
  category: "printing",
  city: "",
  country: "Nigeria",
  quoteCurrency: "NGN",
  payoutAddress: "",
  consentToQuoteDisplay: false,
};
const STEP_FIELDS: (keyof BusinessOnboardingInput)[][] = [
  ["businessName", "contactName", "contactChannelType", "contactChannelValue", "city", "country"],
  ["category", "quoteCurrency"],
  ["payoutAddress", "consentToQuoteDisplay"],
];
const STEP_COPY = [
  { label: "Business", helper: "Who should agents contact?" },
  { label: "Service", helper: "Choose your first capability." },
  { label: "Review", helper: "Set up safe payment and consent." },
] as const;

/** A three-minute, non-technical merchant setup (NFR-UX-001, F-SUP). */
export function OnboardingForm() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    trigger,
    watch,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<BusinessOnboardingInput>({
    resolver: zodResolver(businessOnboardingSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });
  const selectedCategory = watch("category");
  const template = getTemplateForCategory(selectedCategory);

  async function goNext() {
    if (await trigger(STEP_FIELDS[step]))
      setStep((current) => Math.min(current + 1, STEP_COPY.length - 1));
  }
  async function onSubmit(values: BusinessOnboardingInput) {
    setSubmitError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      setDraft(buildOnboardingDraft(values));
    } catch {
      setSubmitError("Something went wrong preparing your draft. Please try again.");
    }
  }
  function handleStartOver() {
    setDraft(null);
    setSubmitError(null);
    setStep(0);
    reset(DEFAULT_VALUES);
  }
  if (draft) return <DraftRoutePreview draft={draft} onStartOver={handleStartOver} />;
  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <ol aria-label="Onboarding progress" className="grid grid-cols-3 gap-2">
        {STEP_COPY.map((item, index) => {
          const complete = index < step;
          const active = index === step;
          return (
            <li key={item.label} className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${complete ? "bg-primary text-primary-contrast" : active ? "bg-primary text-primary-contrast" : "border border-border bg-surface text-muted"}`}
                >
                  {complete ? <Check aria-hidden className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={`truncate text-xs font-medium ${active ? "text-foreground" : "text-muted"}`}
                >
                  {item.label}
                </span>
              </div>
              <p className="mt-1 hidden text-xs text-muted sm:block">{item.helper}</p>
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <fieldset className="space-y-4">
          <legend className="sr-only">Business details</legend>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Tell agents who they are speaking to
            </h2>
            <p className="mt-1 text-sm text-muted">
              These details become your business identity, not a public home address.
            </p>
          </div>
          <TextField
            label="Business name"
            required
            autoComplete="organization"
            hint="The name agents and customers will see."
            error={errors.businessName?.message}
            {...register("businessName")}
          />
          <TextField
            label="Authorised contact"
            required
            autoComplete="name"
            hint="The person who can confirm a quote or pause the route."
            error={errors.contactName?.message}
            {...register("contactName")}
          />
          <SelectField
            label="Order channel"
            required
            options={CHANNEL_OPTIONS}
            error={errors.contactChannelType?.message}
            {...register("contactChannelType")}
          />
          <TextField
            label="Order channel details"
            required
            hint="A WhatsApp number, email, or phone number that receives final orders."
            error={errors.contactChannelValue?.message}
            {...register("contactChannelValue")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="City"
              required
              autoComplete="address-level2"
              error={errors.city?.message}
              {...register("city")}
            />
            <TextField
              label="Country"
              required
              autoComplete="country-name"
              error={errors.country?.message}
              {...register("country")}
            />
          </div>
        </fieldset>
      ) : null}

      {step === 1 ? (
        <fieldset className="space-y-5">
          <legend className="sr-only">First service capability</legend>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Choose your first agent-ready service
            </h2>
            <p className="mt-1 text-sm text-muted">
              Start with one service you can quote reliably. You can add more later.
            </p>
          </div>
          <SelectField
            label="Business category"
            required
            options={CATEGORY_OPTIONS}
            error={errors.category?.message}
            {...register("category")}
          />
          <section
            aria-labelledby="template-heading"
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start gap-3">
              <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="template-heading" className="font-medium">
                    {template.name}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${template.availability === "mvp" ? "bg-success-wash text-success" : "bg-warning-wash text-warning"}`}
                  >
                    {template.availability === "mvp" ? "Ready for MVP" : "Draft template"}
                  </span>
                </div>
                <p className="text-sm text-muted">{template.description}</p>
                <p className="pt-2 text-xs text-muted">
                  Agents will ask: {template.inputFields.map((field) => field.label).join(" · ")}
                </p>
              </div>
            </div>
          </section>
          <SelectField
            label="Quote currency"
            required
            options={CURRENCY_OPTIONS}
            hint="This is the currency you use to quote the final customer order. It is separate from any tiny Celo query fee."
            error={errors.quoteCurrency?.message}
            {...register("quoteCurrency")}
          />
          {template.availability !== "mvp" ? (
            <Callout tone="info" title="You can prepare this route today">
              The template is ready for review, but flyer printing is the first category we will
              activate and test with real buyers during the hackathon.
            </Callout>
          ) : null}
        </fieldset>
      ) : null}

      {step === 2 ? (
        <fieldset className="space-y-4">
          <legend className="sr-only">Consent and payment setup</legend>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Keep your route safe and in your control
            </h2>
            <p className="mt-1 text-sm text-muted">
              A query fee, if enabled, pays for useful business information—not a customer&apos;s
              final order.
            </p>
          </div>
          <Callout tone="info" title="Public address only">
            We never ask for a seed phrase, private key, BVN, NIN, bank login, or card details. Your
            business keeps control of every final customer payment.
          </Callout>
          <TextField
            label="Public Celo payout address"
            required
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="0x…"
            hint="The public address that can receive agent query fees. We verify it before activation."
            error={errors.payoutAddress?.message}
            {...register("payoutAddress")}
          />
          <CheckboxField
            label="I consent to Intra requesting a quote for my business and showing that quote to a buyer."
            error={errors.consentToQuoteDisplay?.message}
            {...register("consentToQuoteDisplay")}
          />
          <section className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium">Before your route goes live</p>
            <ul className="mt-2 space-y-1.5 text-muted">
              <li>1. You review your generated capability card.</li>
              <li>2. Intra verifies your contact, consent, and public payout address.</li>
              <li>3. You test a sample request, then approve activation.</li>
            </ul>
          </section>
        </fieldset>
      ) : null}

      {isSubmitted && hasFieldErrors ? (
        <Callout tone="warning" title="Please fix the highlighted fields">
          Some details are missing or invalid.
        </Callout>
      ) : null}
      {submitError ? (
        <Callout tone="warning" title="Could not create the draft">
          {submitError}
        </Callout>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep((current) => current - 1)}
          >
            <ChevronLeft aria-hidden className="size-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEP_COPY.length - 1 ? (
          <Button type="button" onClick={goNext}>
            Continue <ChevronRight aria-hidden className="size-4" />
          </Button>
        ) : (
          <Button type="submit" pending={isSubmitting}>
            {isSubmitting ? "Preparing draft…" : "Create my capability draft"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        This creates a <strong>draft</strong>. It does not publish a route, accept payment, or send
        messages to customers.
      </p>
    </form>
  );
}
