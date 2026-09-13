"use client";

import { useState } from "react";

import { Check, Copy, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Section";

import { manageLinkMessage, whatsAppShareUrl } from "./manage-link";

/**
 * "This is your way back in" (M10.2A).
 *
 * Shown only to someone already holding a valid manage token — this renders
 * the link they arrived with, it never fetches one. The WhatsApp action is a
 * `wa.me` deep link that opens on THIS device for a human to send: Intra has
 * no outbound messaging integration and this does not pretend otherwise.
 */
export function ManageLinkCard({
  businessName,
  manageUrl,
  contactPhone,
  title = "Your private link",
  description = "This link is how you get back into your business. Save it somewhere safe.",
}: {
  businessName: string;
  manageUrl: string;
  /** The merchant's own WhatsApp number, when the order channel is WhatsApp. */
  contactPhone?: string | null;
  title?: string;
  description?: string;
}) {
  const [copied, setCopied] = useState(false);

  const message = manageLinkMessage(businessName, manageUrl);
  const waHref = contactPhone ? whatsAppShareUrl(contactPhone, message) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The link is
      // selectable text below, so the merchant can still copy it by hand.
      setCopied(false);
    }
  }

  return (
    <Card as="section" className="space-y-3">
      <CardTitle>{title}</CardTitle>
      <p className="text-sm leading-relaxed text-muted">{description}</p>

      <p className="break-all rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-muted">
        {manageUrl}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? (
            <>
              <Check aria-hidden className="size-4" />
              Copied
            </>
          ) : (
            <>
              <Copy aria-hidden className="size-4" />
              Copy link
            </>
          )}
        </Button>

        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-bg px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
          >
            <MessageCircle aria-hidden className="size-4" />
            Send it to myself on WhatsApp
          </a>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {copied ? "Manage link copied to clipboard." : ""}
      </p>

      <p className="text-xs text-subtle">
        Anyone with this link can manage your business. It is not a wallet key and holds no money.
      </p>
    </Card>
  );
}
