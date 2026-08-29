"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { QUOTE_CURRENCIES } from "@/features/routes/schema";
import { buildOnboardingDraft, type OnboardingDraft } from "./draft";
import {
  BUSINESS_CATEGORIES,
  CONTACT_CHANNEL_TYPES,
  businessOnboardingSchema,
  type BusinessOnboardingInput,
} from "./schema";
import { DraftRoutePreview } from "./DraftRoutePreview";

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

export function OnboardingForm() {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<BusinessOnboardingInput>({
    resolver: zodResolver(businessOnboardingSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });

  async function onSubmit(values: BusinessOnboardingInput) {
    setSubmitError(null);
    try {
      // Stands in for a future server round-trip. No network, no persistence.
      await new Promise((resolve) => setTimeout(resolve, 350));
      setDraft(buildOnboardingDraft(values));
    } catch {
      setSubmitError("Something went wrong preparing your draft. Please try again.");
    }
  }

  function handleStartOver() {
    setDraft(null);
    setSubmitError(null);
    reset(DEFAULT_VALUES);
  }

  if (draft) {
    return <DraftRoutePreview draft={draft} onStartOver={handleStartOver} />;
  }

  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
        hint="The WhatsApp number, email, or phone number that receives orders."
        error={errors.contactChannelValue?.message}
        {...register("contactChannelValue")}
      />

      <SelectField
        label="Category"
        required
        options={CATEGORY_OPTIONS}
        error={errors.category?.message}
        {...register("category")}
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

      <SelectField
        label="Quote currency"
        required
        hint="The currency you quote orders in."
        options={CURRENCY_OPTIONS}
        error={errors.quoteCurrency?.message}
        {...register("quoteCurrency")}
      />

      <TextField
        label="Public Celo payout address"
        required
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="0x…"
        hint="Public address only. Never enter a seed phrase or private key."
        error={errors.payoutAddress?.message}
        {...register("payoutAddress")}
      />

      <CheckboxField
        label="I consent to Intra requesting a quote for my business and showing that quote to a buyer."
        error={errors.consentToQuoteDisplay?.message}
        {...register("consentToQuoteDisplay")}
      />

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

      <Button type="submit" pending={isSubmitting}>
        {isSubmitting ? "Preparing draft…" : "Create draft route"}
      </Button>

      <p className="text-xs text-muted">
        This creates a <strong>draft</strong> for review. It does not publish a route or accept any
        payment.
      </p>
    </form>
  );
}
