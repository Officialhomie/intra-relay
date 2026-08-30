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
  QUOTE_RESPONSE_TIMES,
  QUOTE_RESPONSE_TIME_LABELS,
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
const RESPONSE_TIME_OPTIONS = QUOTE_RESPONSE_TIMES.map((value) => ({
  value,
  label: QUOTE_RESPONSE_TIME_LABELS[value],
}));

const CHANNEL_VALUE_HINT: Record<string, string> = {
  whatsapp:
    "The WhatsApp number a buyer messages to place the final order, e.g. +234 801 234 5678.",
  email: "The email address that receives final orders.",
  phone: "The phone number that receives final orders.",
};

const DEFAULT_VALUES: BusinessOnboardingInput = {
  businessName: "",
  contactName: "",
  contactChannelType: "whatsapp",
  contactChannelValue: "",
  category: "printing",
  city: "",
  country: "Nigeria",
  serviceSummary: "",
  serviceArea: "",
  operatingHours: "",
  turnaround: "",
  quoteResponseTime: "2h",
  quoteCurrency: "NGN",
  wantsPaidQueries: true,
  payoutAddress: "",
  consentToQuoteDisplay: false,
};

const STEP_FIELDS: (keyof BusinessOnboardingInput)[][] = [
  ["businessName", "contactName", "contactChannelType", "contactChannelValue", "city", "country"],
  ["serviceArea", "operatingHours", "turnaround"],
  ["category", "serviceSummary", "quoteResponseTime", "quoteCurrency"],
  ["wantsPaidQueries", "payoutAddress", "consentToQuoteDisplay"],
];
const STEP_COPY = [
  { label: "Business", helper: "Who buyers and agents reach." },
  { label: "Area & hours", helper: "Where and when you work." },
  { label: "Your service", helper: "What agents can ask for." },
  { label: "Consent", helper: "Fees, consent, and review." },
] as const;

/** A few-minute, non-technical merchant setup for one WhatsApp-native service (NFR-UX-001, F-SUP). */
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
  const channelType = watch("contactChannelType");
  const wantsPaidQueries = watch("wantsPaidQueries");
  const template = getTemplateForCategory(selectedCategory);

  async function goNext() {
    if (await trigger(STEP_FIELDS[step]))
      setStep((current) => Math.min(current + 1, STEP_COPY.length - 1));
  }
  async function onSubmit(values: BusinessOnboardingInput) {
    setSubmitError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setDraft(buildOnboardingDraft(values));
    } catch {
      setSubmitError("Something went wrong preparing your Capability Card. Please try again.");
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
      <ol aria-label="Onboarding progress" className="grid grid-cols-4 gap-2">
        {STEP_COPY.map((item, index) => {
          const complete = index < step;
          const active = index === step;
          return (
            <li key={item.label} className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${complete || active ? "bg-primary text-primary-contrast" : "border border-border bg-surface text-muted"}`}
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
              Tell agents and buyers who they are dealing with
            </h2>
            <p className="mt-1 text-sm text-muted">
              This becomes your business identity. We never ask for a home or street address.
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
            hint="The person who can confirm a quote or pause the service. This name is never shown to agents."
            error={errors.contactName?.message}
            {...register("contactName")}
          />
          <SelectField
            label="Order channel"
            required
            options={CHANNEL_OPTIONS}
            hint="Most campus businesses use WhatsApp."
            error={errors.contactChannelType?.message}
            {...register("contactChannelType")}
          />
          <TextField
            label={channelType === "whatsapp" ? "WhatsApp number" : "Order channel details"}
            required
            inputMode={channelType === "email" ? "email" : "tel"}
            autoComplete={channelType === "email" ? "email" : "tel"}
            placeholder={channelType === "whatsapp" ? "+234 801 234 5678" : undefined}
            hint={CHANNEL_VALUE_HINT[channelType] ?? "The channel that receives final orders."}
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
        <fieldset className="space-y-4">
          <legend className="sr-only">Service area and hours</legend>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Where and when you work</h2>
            <p className="mt-1 text-sm text-muted">
              An agent uses this to know if you can help before it asks for a quote.
            </p>
          </div>
          <TextField
            label="Service area"
            required
            hint="Areas you deliver to or accept pick-up from, e.g. UNILAG campus and Akoka."
            error={errors.serviceArea?.message}
            {...register("serviceArea")}
          />
          <TextField
            label="Opening hours"
            required
            hint="e.g. Mon–Sat, 9am–6pm."
            error={errors.operatingHours?.message}
            {...register("operatingHours")}
          />
          <TextField
            label="Typical turnaround"
            required
            hint="How long a normal job takes once you confirm it, e.g. same day if approved before noon."
            error={errors.turnaround?.message}
            {...register("turnaround")}
          />
        </fieldset>
      ) : null}

      {step === 2 ? (
        <fieldset className="space-y-5">
          <legend className="sr-only">Your first service</legend>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your first agent-ready service</h2>
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
                  Agents will send: {template.inputFields.map((field) => field.label).join(" · ")}
                </p>
              </div>
            </div>
          </section>
          <TextField
            label="What can this service do?"
            required
            hint="One or two sentences in your words, e.g. A5/A4 flyer printing, full-colour or black-and-white, bulk discounts over 200 copies."
            error={errors.serviceSummary?.message}
            {...register("serviceSummary")}
          />
          <SelectField
            label="How quickly do you reply to a quote request?"
            required
            options={RESPONSE_TIME_OPTIONS}
            hint="Be honest — agents and buyers see this as your response time."
            error={errors.quoteResponseTime?.message}
            {...register("quoteResponseTime")}
          />
          <SelectField
            label="Quote currency"
            required
            options={CURRENCY_OPTIONS}
            hint="The currency you quote the customer's job in. Separate from any tiny agent query fee."
            error={errors.quoteCurrency?.message}
            {...register("quoteCurrency")}
          />
          {template.availability !== "mvp" ? (
            <Callout tone="info" title="You can prepare this route today">
              The template is ready for review, but flyer printing is the first category Intra
              activates and tests with real buyers.
            </Callout>
          ) : null}
        </fieldset>
      ) : null}

      {step === 3 ? (
        <fieldset className="space-y-4">
          <legend className="sr-only">Query fee, consent, and review</legend>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Keep your service safe and in your control
            </h2>
            <p className="mt-1 text-sm text-muted">
              Onboarding does <strong>not</strong> give your business an AI agent, an MCP server, or
              automated order acceptance. You review every quote and the customer approves every
              order.
            </p>
          </div>
          <Callout tone="info" title="What we never ask for">
            A seed phrase, private key, password, BVN, NIN, bank login, or card details. Your
            business keeps control of every final customer payment.
          </Callout>
          <CheckboxField
            label="Let AI agents pay a small fee (about $0.02) to request a quote. This pays for the information, never the customer's order."
            error={errors.wantsPaidQueries?.message}
            {...register("wantsPaidQueries")}
          />
          {wantsPaidQueries ? (
            <TextField
              label="Public Celo payout address"
              required
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="0x…"
              hint="Public address only — it receives the agent query fee. An operator verifies it before activation. Not needed to receive customer orders."
              error={errors.payoutAddress?.message}
              {...register("payoutAddress")}
            />
          ) : (
            <p className="text-xs text-muted">
              No payout address needed. Agents request a quote for free; you can add a fee later
              with your operator.
            </p>
          )}
          <CheckboxField
            label="I consent to Intra requesting a quote for my business and showing that quote to a buyer."
            error={errors.consentToQuoteDisplay?.message}
            {...register("consentToQuoteDisplay")}
          />
          <section className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium">Before your service goes live</p>
            <ul className="mt-2 space-y-1.5 text-muted">
              <li>1. You review the plain-language Capability Card on the next screen.</li>
              <li>2. An operator verifies your contact, consent, and payout address.</li>
              <li>
                3. Only then does the route become ACTIVE. You can pause it any time in one tap.
              </li>
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
        <Callout tone="warning" title="Could not create the Capability Card">
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
            {isSubmitting ? "Preparing…" : "Preview my Capability Card"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        This creates a <strong>draft</strong>. It does not publish a route, accept payment, or send
        any message to a customer.
      </p>
    </form>
  );
}
