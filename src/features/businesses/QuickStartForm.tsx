"use client";

import { useRef, useState } from "react";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Card, CardTitle } from "@/components/ui/Section";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useAnalytics } from "@/features/analytics/useAnalytics";
import { ApiError, apiRequest } from "@/lib/api";
import { PRICING_MODELS, PRICING_MODEL_COPY, type PricingModel } from "@/features/pricing/model";
import { BUSINESS_CATEGORIES } from "./schema";

/**
 * Getting set up, in one screen.
 *
 * A business answers what it does, what it charges, and how to reach it — then
 * it exists. Everything else (opening hours, service area detail, payouts, paid
 * agent queries) is filled in later from their own workspace, because none of it
 * blocks a customer request arriving.
 */

const CATEGORY_LABEL: Record<string, string> = {
  printing: "Printing & copying",
  design: "Design",
  catering: "Food & catering",
  delivery: "Delivery & errands",
  other: "Something else",
};

interface Created {
  business: { id: string; slug: string; name: string };
  service: { name: string; pricingModel: PricingModel };
  manageUrl: string;
  nextStep: string;
}

export function QuickStartForm() {
  const [pricingModel, setPricingModel] = useState<PricingModel>("STARTING_FROM");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Created | null>(null);
  const analytics = useAnalytics("business");
  const startedRef = useRef(false);

  const needsAmount = pricingModel !== "QUOTE_REQUIRED";

  function noteStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    analytics.track("business_onboarding_started", {});
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();

    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const data = await apiRequest<Created>("/api/businesses/quick-start", {
        method: "POST",
        body: {
          businessName: value("businessName"),
          category: value("category"),
          serviceName: value("serviceName"),
          pricingModel,
          priceAmount: needsAmount && value("priceAmount") ? Number(value("priceAmount")) : null,
          priceUnit: value("priceUnit") || null,
          serviceArea: value("serviceArea"),
          city: value("city"),
          contactName: value("contactName"),
          contactChannelValue: value("contactChannelValue"),
          consentToQuoteDisplay: form.get("consent") === "on",
        },
      });
      analytics.identifyBusiness(data.business.id);
      analytics.track("business_onboarding_completed", {
        category: value("category") || undefined,
        pricing_model: pricingModel,
      });
      setCreated(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_BODY") {
        const details = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const flat: Record<string, string> = {};
        for (const [field, messages] of Object.entries(details?.fieldErrors ?? {})) {
          if (messages?.[0]) flat[field] = messages[0];
        }
        setFieldErrors(flat);
        setError("Check the highlighted fields.");
      } else {
        setError(err instanceof ApiError ? err.message : "Could not set your business up.");
      }
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <Card as="section" className="space-y-4">
        <div className="flex items-center gap-2">
          <Check aria-hidden className="size-5 shrink-0 text-success" />
          <CardTitle>{created.business.name} is set up</CardTitle>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Your first service, <strong className="text-foreground">{created.service.name}</strong>,
          is ready. {created.nextStep}
        </p>
        <Link
          href={created.manageUrl}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-contrast hover:opacity-90 sm:w-auto"
        >
          Open your workspace
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        <Callout tone="info" title="Keep this link">
          That link is how you get back in and manage your prices. It is not a wallet key and holds
          no money — but treat it as private.
        </Callout>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} onInput={noteStarted} noValidate className="space-y-5">
      <Card as="section" className="space-y-4">
        <CardTitle>Your business</CardTitle>
        <TextField
          label="Business name"
          name="businessName"
          required
          placeholder="Yaba Reprographics"
          error={fieldErrors.businessName}
        />
        <SelectField
          label="What do you do?"
          name="category"
          required
          defaultValue="printing"
          options={BUSINESS_CATEGORIES.map((value) => ({
            value,
            label: CATEGORY_LABEL[value] ?? value,
          }))}
          error={fieldErrors.category}
        />
      </Card>

      <Card as="section" className="space-y-4">
        <CardTitle>Your first service</CardTitle>
        <p className="text-sm text-muted">
          You can add more later. Start with the one customers ask for most.
        </p>
        <TextField
          label="Service name"
          name="serviceName"
          required
          placeholder="Flyer printing"
          error={fieldErrors.serviceName}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">How do you price it?</legend>
          {PRICING_MODELS.map((model) => {
            const copy = PRICING_MODEL_COPY[model];
            const selected = pricingModel === model;
            return (
              <label
                key={model}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 text-sm transition-colors ${
                  selected
                    ? "border-primary bg-primary-wash"
                    : "border-border hover:border-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="pricingModel"
                  value={model}
                  checked={selected}
                  onChange={() => setPricingModel(model)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  <span className="block font-medium text-foreground">{copy.label}</span>
                  <span className="mt-0.5 block text-muted">{copy.forBusiness}</span>
                  <span className="mt-1 block text-xs text-subtle">e.g. {copy.example}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {needsAmount ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label={pricingModel === "FIXED" ? "Your price (NGN)" : "Starting price (NGN)"}
              name="priceAmount"
              type="number"
              inputMode="decimal"
              min="1"
              required
              placeholder="15000"
              error={fieldErrors.priceAmount}
            />
            <TextField
              label="What does that cover?"
              name="priceUnit"
              placeholder="per 100"
              hint="Optional — leave blank for a flat job price."
            />
          </div>
        ) : null}
      </Card>

      <Card as="section" className="space-y-4">
        <CardTitle>Where and who</CardTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="City"
            name="city"
            required
            placeholder="Lagos"
            error={fieldErrors.city}
          />
          <TextField
            label="Areas you cover"
            name="serviceArea"
            required
            placeholder="Yaba and Akoka"
            error={fieldErrors.serviceArea}
          />
        </div>
        <TextField
          label="Who should customers ask for?"
          name="contactName"
          required
          placeholder="Tolu"
          error={fieldErrors.contactName}
        />
        <TextField
          label="WhatsApp number for orders"
          name="contactChannelValue"
          required
          inputMode="tel"
          placeholder="+234 801 234 5678"
          hint="Customers message you here to place the order. Intra never sends it for you."
          error={fieldErrors.contactChannelValue}
        />
        <CheckboxField
          name="consent"
          label={
            <>
              You can show my prices to customers
              <span className="mt-0.5 block text-xs text-muted">
                Your price is shown with your business name when a customer asks for this service.
              </span>
            </>
          }
          error={fieldErrors.consentToQuoteDisplay}
        />
      </Card>

      {error ? (
        <Callout tone="warning" title="Not quite">
          {error}
        </Callout>
      ) : null}

      <Button type="submit" pending={pending}>
        Set up my business
      </Button>
      <p className="text-xs text-subtle">
        No card, no wallet, and no private keys — ever. An operator checks your details before
        customers can reach you.
      </p>
    </form>
  );
}
