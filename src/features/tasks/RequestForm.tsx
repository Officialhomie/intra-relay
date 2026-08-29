"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, CircleDashed, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import {
  FLYER_COLOURS,
  FLYER_SIZES,
  flyerPrintingInputSchema,
  type FlyerPrintingInput,
} from "@/features/routes/flyer-printing";

const sizeOptions = FLYER_SIZES.map((value) => ({ value, label: value }));
const colourOptions = FLYER_COLOURS.map((value) => ({
  value,
  label: value === "full-colour" ? "Full colour" : "Black and white",
}));

type FlyerFormInput = z.input<typeof flyerPrintingInputSchema>;
const DEFAULT_VALUES: FlyerFormInput = {
  size: "A5",
  quantity: 100,
  colour: "full-colour",
  deadline: "",
  deliveryArea: "",
};

export function RequestForm() {
  const [submitted, setSubmitted] = useState<FlyerPrintingInput | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FlyerFormInput, unknown, FlyerPrintingInput>({
    resolver: zodResolver(flyerPrintingInputSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });
  async function onSubmit(values: FlyerPrintingInput) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    setSubmitted(values);
  }
  if (submitted) return <TaskPreview brief={submitted} onRestart={() => setSubmitted(null)} />;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Paper size"
          required
          options={sizeOptions}
          error={errors.size?.message}
          {...register("size")}
        />
        <TextField
          label="Number of copies"
          required
          inputMode="numeric"
          type="number"
          min="1"
          max="100000"
          hint="For example, 100."
          error={errors.quantity?.message}
          {...register("quantity")}
        />
      </div>
      <SelectField
        label="Colour preference"
        required
        options={colourOptions}
        error={errors.colour?.message}
        {...register("colour")}
      />
      <TextField
        label="Needed by"
        required
        placeholder="Friday 3pm"
        hint="A clear deadline helps the printer confirm availability."
        error={errors.deadline?.message}
        {...register("deadline")}
      />
      <TextField
        label="Delivery or pick-up area"
        required
        placeholder="UNILAG main gate"
        error={errors.deliveryArea?.message}
        {...register("deliveryArea")}
      />
      <Callout tone="info" title="You stay in control">
        Intra only prepares a recommendation and order message. It never sends your order or pays a
        supplier on your behalf.
      </Callout>
      <Button type="submit" pending={isSubmitting}>
        {isSubmitting ? "Preparing your brief…" : "Find a printing quote"}
      </Button>
    </form>
  );
}

function TaskPreview({ brief, onRestart }: { brief: FlyerPrintingInput; onRestart: () => void }) {
  const taskId = "demo-" + brief.quantity + "-flyers";
  const message = `Hello, I would like a quote for ${brief.quantity} ${brief.size} ${brief.colour} flyers. I need them by ${brief.deadline} and ${brief.deliveryArea}. Please confirm price, turnaround, and availability.`;
  return (
    <section aria-live="polite" className="space-y-5">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Brief ready</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          Your request is structured for a real printer
        </h2>
        <p className="mt-1 text-sm text-muted">
          Demo preview only — no supplier has been contacted and no payment has been attempted.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
        <Detail label="Size" value={brief.size} />
        <Detail label="Copies" value={String(brief.quantity)} />
        <Detail label="Colour" value={brief.colour} />
        <Detail label="Deadline" value={brief.deadline} />
        <div className="col-span-2 bg-bg p-3">
          <dt className="text-xs text-muted">Area</dt>
          <dd className="mt-0.5 font-medium">{brief.deliveryArea}</dd>
        </div>
      </dl>
      <section className="rounded-lg border border-border">
        <div className="border-b border-border bg-surface p-4">
          <p className="font-medium">Agent activity</p>
          <p className="mt-1 text-sm text-muted">
            The production flow records every step, including only verified Celo receipts.
          </p>
        </div>
        <ol className="space-y-0 p-4">
          <Activity
            complete
            label="Brief structured"
            detail={`Task ${taskId} has the fields a printer needs.`}
          />
          <Activity
            current
            label="Finding an active, verified route"
            detail="A live route is selected only when its merchant, consent, payout address, and freshness are verified."
          />
          <Activity
            label="Requesting a fresh quote"
            detail="If a business enables a paid route, the agent receives a Celo x402 payment request first."
          />
          <Activity
            label="Human-approved order handoff"
            detail="The final WhatsApp order is prepared but never auto-sent."
          />
        </ol>
      </section>
      <Callout tone="warning" title="No payment receipt yet">
        Celo x402/cPay settlement is intentionally marked unavailable until official facilitator
        credentials are configured and a transaction is verified. Intra never fabricates a
        successful payment.
      </Callout>
      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 text-emerald-600" />
          <div>
            <p className="font-medium">When a printer confirms your quote</p>
            <p className="text-sm text-muted">
              You will get a message like this to review and send yourself.
            </p>
          </div>
        </div>
        <div className="rounded-md bg-surface p-3 text-sm leading-relaxed">{message}</div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigator.clipboard?.writeText(message)}
        >
          <Copy aria-hidden className="size-4" /> Copy WhatsApp message
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline"
        >
          Open WhatsApp when you are ready <ExternalLink aria-hidden className="size-4" />
        </a>
      </section>
      <button
        type="button"
        onClick={onRestart}
        className="text-sm text-muted underline hover:text-foreground"
      >
        Start a new request
      </button>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize">{value}</dd>
    </div>
  );
}
function Activity({
  label,
  detail,
  complete = false,
  current = false,
}: {
  label: string;
  detail: string;
  complete?: boolean;
  current?: boolean;
}) {
  const Icon = complete ? CheckCircle2 : CircleDashed;
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <Icon
        aria-hidden
        className={`mt-0.5 size-5 shrink-0 ${complete ? "text-emerald-600" : current ? "text-blue-600" : "text-muted"}`}
      />
      <div>
        <p className={current ? "font-medium" : "font-medium text-muted"}>{label}</p>
        <p className="mt-0.5 text-sm text-muted">{detail}</p>
      </div>
    </li>
  );
}
