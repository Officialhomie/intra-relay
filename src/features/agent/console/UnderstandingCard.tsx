"use client";

import { useState } from "react";

import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Section";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { FLYER_COLOURS, FLYER_SIZES } from "@/features/routes/flyer-printing";

import type { BriefCorrectionInput, Understanding } from "./types";

/**
 * "What the agent understood", with a correction path.
 *
 * The buyer never fills a form to start — but they must be able to fix a
 * misreading, because a wrong brief produces a wrong price. Correcting does not
 * make them retype anything: the original request is carried forward and only
 * the corrected fields are sent (Part 7 / Part 15).
 */

const SIZE_OPTIONS = FLYER_SIZES.map((value) => ({ value, label: value }));
const COLOUR_OPTIONS = FLYER_COLOURS.map((value) => ({
  value,
  label: value === "full-colour" ? "Full colour" : "Black and white",
}));

function colourEnum(phrase: string | null): string {
  if (phrase === "full colour" || phrase === "full-colour") return "full-colour";
  if (phrase === "black and white" || phrase === "black-and-white") return "black-and-white";
  return "";
}

function colourLabel(phrase: string | null): string {
  const value = colourEnum(phrase);
  return COLOUR_OPTIONS.find((o) => o.value === value)?.label ?? "—";
}

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readableDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

interface Props {
  understanding: Understanding;
  /** Fields the agent still needs, if any — highlighted in the editor. */
  missing?: string[];
  editable: boolean;
  pending: boolean;
  onCorrect: (correction: BriefCorrectionInput) => void;
  /** Open the editor immediately (used when the agent asked a question). */
  startOpen?: boolean;
}

export function UnderstandingCard({
  understanding,
  missing = [],
  editable,
  pending,
  onCorrect,
  startOpen = false,
}: Props) {
  const [editing, setEditing] = useState(startOpen);
  const [quantity, setQuantity] = useState(understanding.quantity?.toString() ?? "");
  const [size, setSize] = useState(understanding.size ?? "");
  const [colour, setColour] = useState(colourEnum(understanding.colour));
  const [deadline, setDeadline] = useState(dateInputValue(understanding.deadline));
  const [deliveryArea, setDeliveryArea] = useState(understanding.deliveryArea ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    onCorrect({
      quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : null,
      size: size || null,
      colour: colour || null,
      deadline: deadline || null,
      deliveryArea: deliveryArea.trim() || null,
    });
  }

  if (editing) {
    return (
      <Card as="section" className="space-y-4">
        <CardTitle>Fix what I understood</CardTitle>
        <p className="text-sm text-muted">
          I&apos;ll use these instead of my own reading and pick up where I left off — you
          don&apos;t need to retype your request.
        </p>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="How many"
              type="number"
              inputMode="numeric"
              min="1"
              max="100000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              hint={missing.includes("quantity") ? "I still need this" : undefined}
            />
            <SelectField
              label="Paper size"
              options={[{ value: "", label: "Choose…" }, ...SIZE_OPTIONS]}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              hint={missing.includes("size") ? "I still need this" : undefined}
            />
          </div>
          <SelectField
            label="Colour"
            options={[{ value: "", label: "Choose…" }, ...COLOUR_OPTIONS]}
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            hint={missing.includes("colour") ? "I still need this" : undefined}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Needed by"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              hint={missing.includes("deadline") ? "I still need this" : undefined}
            />
            <TextField
              label="Delivery or pick-up area"
              value={deliveryArea}
              onChange={(e) => setDeliveryArea(e.target.value)}
              placeholder="UNILAG main gate"
              hint={missing.includes("deliveryArea") ? "I still need this" : undefined}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={pending}>
              Use these details
            </Button>
            {!startOpen ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card as="section" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CardTitle>What I understood</CardTitle>
        {editable ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="sm:w-auto">
            <Pencil aria-hidden className="size-3.5" />
            Not quite right?
          </Button>
        ) : null}
      </div>
      <p className="text-base text-foreground">{understanding.summary}</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted">Needed by</dt>
          <dd className="text-foreground">{readableDate(understanding.deadline)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">Colour</dt>
          <dd className="text-foreground">{colourLabel(understanding.colour)}</dd>
        </div>
      </dl>
    </Card>
  );
}
