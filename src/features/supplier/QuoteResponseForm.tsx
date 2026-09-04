"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ApiError, apiRequest } from "@/lib/api";

interface Props {
  routeId: string;
  taskId: string;
  manageToken: string;
  currency: string;
}

type Errors = Partial<Record<string, string>>;

export function QuoteResponseForm({ routeId, taskId, manageToken, currency }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"quote" | "decline">("quote");
  const [priceType, setPriceType] = useState<"fixed" | "range">("fixed");
  const [values, setValues] = useState({
    amountMin: "",
    amountMax: "",
    deliveryCharge: "",
    turnaround: "",
    availabilityNote: "",
    assumptions: "",
    confidence: "medium",
    expiresAt: "",
    declineReason: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  function set(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (mode === "decline") {
      if (values.declineReason.trim().length < 3) {
        next.declineReason = "Tell the buyer why (out of area, at capacity, etc.).";
      }
      return next;
    }
    const min = Number(values.amountMin);
    if (!values.amountMin || Number.isNaN(min) || min < 0) next.amountMin = "Enter a valid amount.";
    if (priceType === "range") {
      const max = Number(values.amountMax);
      if (!values.amountMax || Number.isNaN(max)) next.amountMax = "Enter the top of the range.";
      else if (max < min) next.amountMax = "The maximum cannot be below the minimum.";
    }
    if (values.deliveryCharge && Number.isNaN(Number(values.deliveryCharge))) {
      next.deliveryCharge = "Enter a number, or leave blank.";
    }
    if (values.turnaround.trim().length < 1) next.turnaround = "How soon can you deliver?";
    return next;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPhase("pending");
    try {
      if (mode === "decline") {
        await apiRequest(`/api/routes/${routeId}/quotes`, {
          method: "POST",
          manageToken,
          body: { decline: true, taskId, reason: values.declineReason.trim() },
        });
      } else {
        await apiRequest(`/api/routes/${routeId}/quotes`, {
          method: "POST",
          manageToken,
          body: {
            taskId,
            amountMin: Number(values.amountMin),
            amountMax: priceType === "range" ? Number(values.amountMax) : undefined,
            deliveryCharge: values.deliveryCharge ? Number(values.deliveryCharge) : undefined,
            turnaround: values.turnaround.trim(),
            availabilityNote: values.availabilityNote.trim() || undefined,
            assumptions: values.assumptions.trim() || undefined,
            confidence: values.confidence,
            fixed: priceType === "fixed",
            expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : undefined,
          },
        });
      }
      setPhase("done");
      router.refresh();
    } catch (error) {
      setPhase("error");
      setFormError(error instanceof ApiError ? error.message : "Could not send your response.");
    }
  }

  if (phase === "done") {
    return (
      <Callout tone="success" title={mode === "decline" ? "Request declined" : "Quote sent"}>
        {mode === "decline"
          ? "The buyer has been told this request cannot be fulfilled."
          : "The buyer will now review your quote and decide whether to proceed. If they do, they message you directly."}
      </Callout>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="flex gap-2 rounded-md bg-bg p-1">
        {(["quote", "decline"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === option
                ? "bg-primary text-primary-contrast"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option === "quote" ? "Send a quote" : "Decline"}
          </button>
        ))}
      </div>

      {mode === "quote" ? (
        <>
          <SelectField
            label="Price type"
            value={priceType}
            onChange={(event) => setPriceType(event.target.value as "fixed" | "range")}
            options={[
              { value: "fixed", label: "Fixed price" },
              { value: "range", label: "Estimated range" },
            ]}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label={priceType === "fixed" ? `Price (${currency})` : `From (${currency})`}
              required
              inputMode="decimal"
              value={values.amountMin}
              onChange={(event) => set("amountMin", event.target.value)}
              error={errors.amountMin}
            />
            {priceType === "range" ? (
              <TextField
                label={`To (${currency})`}
                required
                inputMode="decimal"
                value={values.amountMax}
                onChange={(event) => set("amountMax", event.target.value)}
                error={errors.amountMax}
              />
            ) : null}
          </div>
          <TextField
            label="Turnaround"
            required
            placeholder="e.g. same day, 2 working days"
            value={values.turnaround}
            onChange={(event) => set("turnaround", event.target.value)}
            error={errors.turnaround}
          />
          <TextField
            label="Quote valid until"
            type="datetime-local"
            hint="Optional — after this the customer must ask again."
            value={values.expiresAt}
            onChange={(event) => set("expiresAt", event.target.value)}
          />

          <details className="rounded-md border border-border bg-bg px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-muted">
              Add more detail (optional)
            </summary>
            <div className="mt-3 space-y-4">
              <TextField
                label={`Delivery charge (${currency})`}
                inputMode="decimal"
                hint="Leave blank if delivery is included or not applicable."
                value={values.deliveryCharge}
                onChange={(event) => set("deliveryCharge", event.target.value)}
                error={errors.deliveryCharge}
              />
              <TextField
                label="Availability note"
                placeholder="e.g. can start after 2pm today"
                value={values.availabilityNote}
                onChange={(event) => set("availabilityNote", event.target.value)}
              />
              <TextField
                label="Assumptions"
                placeholder="e.g. artwork supplied print-ready"
                value={values.assumptions}
                onChange={(event) => set("assumptions", event.target.value)}
              />
              <SelectField
                label="Confidence"
                value={values.confidence}
                onChange={(event) => set("confidence", event.target.value)}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            </div>
          </details>
        </>
      ) : (
        <TextField
          label="Reason for declining"
          required
          placeholder="Out of delivery area / at capacity this week"
          value={values.declineReason}
          onChange={(event) => set("declineReason", event.target.value)}
          error={errors.declineReason}
        />
      )}

      {mode === "quote" ? (
        <Callout tone="info" title="How the buyer sees this">
          The buyer is shown these figures as the printer&apos;s quote, entered through Intra. Intra
          does not independently verify them. Set an expiry if the price is only good for a limited
          time.
        </Callout>
      ) : null}

      {formError ? (
        <Callout tone="warning" title="Could not send">
          {formError}
        </Callout>
      ) : null}

      <Button
        type="submit"
        pending={phase === "pending"}
        variant={mode === "decline" ? "danger" : "primary"}
      >
        {mode === "decline" ? "Decline this request" : "Send quote to buyer"}
      </Button>
    </form>
  );
}
