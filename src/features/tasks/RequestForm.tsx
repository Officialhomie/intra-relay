"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, Store } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/States";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ApiError, apiRequest } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { getSessionId } from "@/lib/session";
import {
  FLYER_COLOURS,
  FLYER_SIZES,
  flyerPrintingInputSchema,
  type FlyerPrintingInput,
} from "@/features/routes/flyer-printing";

type FlyerFormInput = z.input<typeof flyerPrintingInputSchema>;

const sizeOptions = FLYER_SIZES.map((value) => ({ value, label: value }));
const colourOptions = FLYER_COLOURS.map((value) => ({
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

interface ActiveRoute {
  routeId: string;
  businessName: string;
  city: string;
  country: string;
  responseSlaMinutes: number;
  priceUpdatedAt: string | null;
}

export function RequestForm() {
  const router = useRouter();
  const [brief, setBrief] = useState<FlyerPrintingInput | null>(null);
  const [routes, setRoutes] = useState<ActiveRoute[] | null>(null);
  const [pickedRouteId, setPickedRouteId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"brief" | "loadingRoutes" | "pick" | "submitting" | "error">(
    "brief",
  );
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FlyerFormInput, unknown, FlyerPrintingInput>({
    resolver: zodResolver(flyerPrintingInputSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });

  async function onBriefSubmit(values: FlyerPrintingInput) {
    setBrief(values);
    setPhase("loadingRoutes");
    setError(null);
    try {
      const data = await apiRequest<ActiveRoute[]>("/api/routes/active");
      setRoutes(data);
      setPickedRouteId(data[0]?.routeId ?? null);
      setPhase("pick");
    } catch {
      setPhase("error");
      setError("Could not load available printers. Please try again.");
    }
  }

  async function submitRequest() {
    if (!brief || !pickedRouteId) return;
    setPhase("submitting");
    setError(null);
    const sessionId = getSessionId();
    try {
      const task = await apiRequest<{ id: string }>("/api/tasks", {
        method: "POST",
        sessionId,
        body: { structuredInput: brief, route: { routeId: pickedRouteId } },
      });
      await apiRequest(`/api/tasks/${task.id}/submit`, { method: "POST", sessionId, body: {} });
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      setPhase("pick");
      if (err instanceof ApiError && err.code === "ROUTE_UNAVAILABLE") {
        setError("That printer just went offline. Pick another, or try again shortly.");
      } else {
        setError(err instanceof ApiError ? err.message : "Could not send your request.");
      }
    }
  }

  if (phase === "pick" || phase === "submitting") {
    if (routes && routes.length === 0) {
      return (
        <EmptyState
          icon={Store}
          title="No printers are live yet"
          description="No verified flyer-printing route is active right now. Check back soon."
          action={
            <Button size="sm" variant="secondary" onClick={() => setPhase("brief")}>
              Edit my brief
            </Button>
          }
        />
      );
    }
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-light tracking-tight">Choose a printer</h2>
          <p className="mt-1 text-sm text-muted">
            Your brief goes to the printer you pick. They send a quote; you approve any order
            yourself.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="sr-only">Available printers</legend>
          {(routes ?? []).map((route) => (
            <label
              key={route.routeId}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 text-sm transition-colors ${
                pickedRouteId === route.routeId
                  ? "border-primary bg-primary-wash"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                name="printer"
                className="mt-0.5 size-4"
                checked={pickedRouteId === route.routeId}
                onChange={() => setPickedRouteId(route.routeId)}
              />
              <span>
                <span className="block font-medium text-foreground">{route.businessName}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <MapPin aria-hidden className="size-3" />
                  {route.city}, {route.country} · replies within {route.responseSlaMinutes} min
                </span>
                {route.priceUpdatedAt ? (
                  <span className="mt-0.5 block text-xs text-subtle">
                    Prices confirmed {relativeTime(route.priceUpdatedAt)}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        {error ? (
          <Callout tone="warning" title="Could not send">
            {error}
          </Callout>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            pending={phase === "submitting"}
            disabled={!pickedRouteId}
            onClick={submitRequest}
          >
            Send request &amp; get a quote
          </Button>
          <Button variant="ghost" onClick={() => setPhase("brief")}>
            Edit brief
          </Button>
        </div>
        <p className="text-xs text-muted">
          Intra never sends an order or pays a printer for you. You always confirm and pay directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onBriefSubmit)} noValidate className="space-y-4">
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

      {phase === "error" && error ? (
        <Callout tone="warning" title="Something went wrong">
          {error}
        </Callout>
      ) : null}

      <Callout tone="info" title="You stay in control">
        Intra prepares a recommendation and a WhatsApp message. It never sends your order or pays a
        supplier on your behalf.
      </Callout>

      <Button type="submit" pending={isSubmitting || phase === "loadingRoutes"}>
        {phase === "loadingRoutes" ? "Finding printers…" : "Find a printing quote"}
      </Button>
    </form>
  );
}
