"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ApiError, apiRequest } from "@/lib/api";
import { PRICING_MODELS, PRICING_MODEL_COPY, type PricingModel } from "@/features/pricing/model";

/**
 * A business edits the price it publishes for a service (milestone 6 §19).
 *
 * The form is explicit that this is the *published* figure, and that any job a
 * customer has already agreed keeps the price they agreed — this never changes
 * a quote.
 */
export function EditPublishedPriceForm({
  routeId,
  manageToken,
  currency,
  model,
  amount,
  unit,
}: {
  routeId: string;
  manageToken: string;
  currency: string;
  model: PricingModel;
  amount: string | null;
  unit: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nextModel, setNextModel] = useState<PricingModel>(model);
  const [nextAmount, setNextAmount] = useState(amount ?? "");
  const [nextUnit, setNextUnit] = useState(unit ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const needsAmount = nextModel !== "QUOTE_REQUIRED";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (needsAmount && (!nextAmount || Number(nextAmount) <= 0)) {
      setError("Enter the amount customers should see.");
      return;
    }
    setPending(true);
    try {
      await apiRequest(`/api/routes/${routeId}/pricing`, {
        method: "PATCH",
        manageToken,
        body: {
          model: nextModel,
          amount: needsAmount ? Number(nextAmount) : null,
          unit: needsAmount && nextUnit.trim() ? nextUnit.trim() : null,
        },
      });
      setDone(true);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update your price. Try again shortly.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="pt-1">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(false);
          }}
          className="text-xs font-medium text-primary underline"
        >
          Edit this price
        </button>
        {done ? <span className="ml-2 text-xs text-success">Saved.</span> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-3 rounded-md border border-border bg-bg p-3">
      <SelectField
        label="How you price it"
        value={nextModel}
        onChange={(e) => setNextModel(e.target.value as PricingModel)}
        options={PRICING_MODELS.map((m) => ({ value: m, label: PRICING_MODEL_COPY[m].label }))}
      />
      {needsAmount ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label={`Amount (${currency})`}
            type="number"
            inputMode="decimal"
            min="1"
            value={nextAmount}
            onChange={(e) => setNextAmount(e.target.value)}
          />
          <TextField
            label="What it covers"
            value={nextUnit}
            onChange={(e) => setNextUnit(e.target.value)}
            placeholder="per 100"
            hint="Optional"
          />
        </div>
      ) : null}

      <Callout tone="info">
        This is the price customers see before they ask. Any job someone has already agreed keeps
        the price you agreed — this does not change a quote.
      </Callout>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" pending={pending}>
          Save price
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
