"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { TextField } from "@/components/ui/TextField";
import { ApiError, apiRequest } from "@/lib/api";
import { formatMoney } from "@/lib/format";

/**
 * Changing a price the business has already sent.
 *
 * The form tells the operator up front what will happen, because the two cases
 * are genuinely different and both are fair: before the customer agreed, the
 * new price simply replaces the old one; afterwards, the customer has to accept
 * the change before it means anything.
 */
export function ChangePriceForm({
  routeId,
  taskId,
  manageToken,
  currency,
  currentAmount,
  alreadyAgreed,
}: {
  routeId: string;
  taskId: string;
  manageToken: string;
  currency: string;
  currentAmount: string;
  /** True once the customer has accepted this price. */
  alreadyAgreed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [turnaround, setTurnaround] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value < 0) {
      setError("Enter the new amount.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Tell the customer why the price is changing.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await apiRequest(`/api/routes/${routeId}/quotes`, {
        method: "POST",
        manageToken,
        body: {
          revise: true,
          taskId,
          amountMin: value,
          turnaround: turnaround.trim() || "as before",
          reason: reason.trim(),
        },
      });
      setDone(
        alreadyAgreed
          ? "Sent. The customer has to accept the change before it takes effect — the price they agreed still stands until they do."
          : "Sent. The customer now sees the new price.",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the new price.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <Callout tone="success" title="Price change sent">
        {done}
      </Callout>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Change this price
      </Button>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium">Change your price</p>
        <p className="mt-1 text-sm text-muted">
          You quoted {formatMoney(currentAmount, currency)}.{" "}
          {alreadyAgreed
            ? "This customer has already agreed that price, so your new one is a request they must accept. Until they do, the agreed price stands."
            : "They have not agreed yet, so your new price replaces the old one."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={`New amount (${currency})`}
          type="number"
          inputMode="decimal"
          min="0"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Turnaround"
          value={turnaround}
          onChange={(e) => setTurnaround(e.target.value)}
          placeholder="same day"
          hint="Leave blank to keep what you said before."
        />
      </div>

      <TextField
        label="Why is it changing?"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Card stock went up this morning"
        hint="The customer sees this in your own words."
      />

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" pending={pending}>
          {alreadyAgreed ? "Ask the customer to accept" : "Send the new price"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
