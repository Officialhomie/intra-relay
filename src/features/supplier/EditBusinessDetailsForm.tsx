"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DataList, DataRow } from "@/components/ui/DataList";
import { TextField } from "@/components/ui/TextField";
import { ApiError, apiRequest } from "@/lib/api";

/**
 * A business corrects its own basic details (M10.2B).
 *
 * Read-only until the merchant taps Edit, so the page still answers "what do
 * you have on me?" at a glance. Only the four fields the server accepts appear
 * here — everything else on the review page (payout address, consent,
 * verification) stays read-only, because a merchant changing it themselves
 * would mean something different from a merchant correcting a typo.
 *
 * No validation rules are restated: the server owns them, and its messages are
 * shown verbatim.
 */
export function EditBusinessDetailsForm({
  slug,
  manageToken,
  channelLabel,
  businessName,
  contactName,
  contactChannelValue,
  city,
}: {
  slug: string;
  manageToken: string;
  channelLabel: string;
  businessName: string;
  contactName: string;
  contactChannelValue: string;
  city: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const [nextName, setNextName] = useState(businessName);
  const [nextContact, setNextContact] = useState(contactName);
  const [nextChannel, setNextChannel] = useState(contactChannelValue);
  const [nextCity, setNextCity] = useState(city);

  function cancel() {
    setNextName(businessName);
    setNextContact(contactName);
    setNextChannel(contactChannelValue);
    setNextCity(city);
    setFieldErrors({});
    setError(null);
    setOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      await apiRequest(`/api/businesses/${slug}/profile`, {
        method: "PATCH",
        manageToken,
        body: {
          businessName: nextName.trim(),
          contactName: nextContact.trim(),
          contactChannelValue: nextChannel.trim(),
          city: nextCity.trim(),
        },
      });
      setSaved(true);
      setOpen(false);
      router.refresh();
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
        setError(
          err instanceof ApiError ? err.message : "Could not save your details. Try again shortly.",
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <>
        <DataList className="mt-4">
          <DataRow label="Business name">{businessName}</DataRow>
          <DataRow label="Authorised contact">{contactName}</DataRow>
          <DataRow label="Order channel">
            {channelLabel} · {contactChannelValue}
          </DataRow>
          <DataRow label="City">{city}</DataRow>
        </DataList>
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(true);
              setSaved(false);
            }}
          >
            Edit my details
          </Button>
          {saved ? <span className="text-xs text-success">Saved.</span> : null}
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <TextField
        label="Business name"
        name="businessName"
        value={nextName}
        onChange={(e) => setNextName(e.target.value)}
        error={fieldErrors.businessName}
        hint="What customers see. Your web address stays the same."
      />
      <TextField
        label="Authorised contact"
        name="contactName"
        value={nextContact}
        onChange={(e) => setNextContact(e.target.value)}
        error={fieldErrors.contactName}
        hint="Who customers should ask for."
      />
      <TextField
        label={`${channelLabel} number that receives orders`}
        name="contactChannelValue"
        value={nextChannel}
        onChange={(e) => setNextChannel(e.target.value)}
        error={fieldErrors.contactChannelValue}
      />
      <TextField
        label="City"
        name="city"
        value={nextCity}
        onChange={(e) => setNextCity(e.target.value)}
        error={fieldErrors.city}
      />

      <Callout tone="info">
        Your prices, services and verification are not changed here. Prices are edited on each
        service; your Intra operator handles verification.
      </Callout>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" pending={pending}>
          Save details
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
