"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { Button } from "@/components/ui/Button";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { TextField } from "@/components/ui/TextField";
import {
  FLYER_COLOURS,
  FLYER_SIZES,
  flyerPrintingInputSchema,
} from "@/features/routes/flyer-printing";

type FlyerFormInput = z.input<typeof flyerPrintingInputSchema>;

const SIZE_OPTIONS = FLYER_SIZES.map((value) => ({ value, label: value }));
const COLOUR_OPTIONS = FLYER_COLOURS.map((value) => ({
  value,
  label: value === "full-colour" ? "Full colour" : "Black and white",
}));

const DEFAULT_VALUES: FlyerFormInput = {
  size: "A5",
  quantity: 100,
  colour: "full-colour",
  deadline: "",
  deliveryArea: "",
};

/** The same sentence shape as the console's own known-good examples (§EXAMPLES). */
function toSentence(input: z.infer<typeof flyerPrintingInputSchema>): string {
  return `I need ${input.quantity} ${input.size} ${input.colour} flyers by ${input.deadline}, delivered to ${input.deliveryArea}.`;
}

/**
 * "Prefer a form?" — a structured alternative to typing, for the same one
 * message the composer sends (frontend audit D6, Priority 4). It does not
 * call any API itself: it composes one sentence and hands it to the caller,
 * so the resulting request goes through the exact same conversation → agent
 * run pipeline as free text, with the same multi-provider comparison and
 * `buyerClaimSession` behaviour intact.
 */
export function StructuredRequestForm({
  onSubmitSentence,
  onCancel,
  pending,
}: {
  onSubmitSentence: (sentence: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FlyerFormInput, unknown, z.infer<typeof flyerPrintingInputSchema>>({
    resolver: zodResolver(flyerPrintingInputSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });

  function onValid(values: z.infer<typeof flyerPrintingInputSchema>) {
    onSubmitSentence(toSentence(values));
  }

  return (
    <form
      onSubmit={handleSubmit(onValid)}
      noValidate
      className="space-y-4 rounded-md border border-border p-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Controller
          name="size"
          control={control}
          render={({ field }) => (
            <ChipGroup
              label="Paper size"
              options={SIZE_OPTIONS}
              value={field.value ?? DEFAULT_VALUES.size}
              onChange={field.onChange}
              error={errors.size?.message}
            />
          )}
        />
        <TextField
          label="Number of copies"
          required
          inputMode="numeric"
          type="number"
          min="1"
          max="100000"
          error={errors.quantity?.message}
          {...register("quantity")}
        />
      </div>
      <Controller
        name="colour"
        control={control}
        render={({ field }) => (
          <ChipGroup
            label="Colour"
            options={COLOUR_OPTIONS}
            value={field.value ?? DEFAULT_VALUES.colour}
            onChange={field.onChange}
            error={errors.colour?.message}
          />
        )}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Needed by"
          required
          placeholder="Friday 3pm"
          error={errors.deadline?.message}
          {...register("deadline")}
        />
        <TextField
          label="Delivery or pick-up area"
          required
          placeholder="Yaba"
          error={errors.deliveryArea?.message}
          {...register("deliveryArea")}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" pending={pending}>
          Send this request
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Back to typing
        </Button>
      </div>
    </form>
  );
}
