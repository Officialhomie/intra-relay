import { site } from "@/lib/site";

/**
 * The merchant's manage link (ADR-008 capability URL), in one place (M10.2).
 *
 * The shape `/supplier/<slug>?t=<token>` was previously written out by hand in
 * `quick-start.ts` and `notifications/catalogue.ts`. It is a security-relevant
 * string — it IS the credential — so it gets one definition, not three.
 *
 * SAFETY: nothing here reads a token from the database. Callers pass a token
 * they already legitimately hold (the one the merchant presented, or an
 * operator-gated read). Never log the result — it carries the token.
 */

/** Relative manage path, e.g. `/supplier/yaba-prints?t=abc…`. */
export function manageLinkPath(slug: string, manageToken: string): string {
  return `/supplier/${slug}?t=${manageToken}`;
}

/** Absolute manage link, for something a human copies, shares, or types. */
export function manageLinkUrl(slug: string, manageToken: string): string {
  return `${site.url}${manageLinkPath(slug, manageToken)}`;
}

/**
 * The message a human sends the merchant, in plain non-technical language.
 *
 * Deliberately says nothing about tokens, capabilities or URLs-as-credentials
 * beyond "keep it private" — the reader is an SME owner on a phone, not an
 * engineer.
 */
export function manageLinkMessage(businessName: string, url: string): string {
  return [
    `Hi ${businessName} — this is your private Intra link.`,
    "",
    url,
    "",
    "Open it to see customer requests, send prices, and update your details.",
    "Keep it to yourself: anyone with this link can manage your business.",
  ].join("\n");
}

/**
 * A `wa.me` deep link that opens WhatsApp with the message pre-filled.
 *
 * Intra has no outbound messaging integration and this does not add one — it
 * opens WhatsApp on the device of whoever is already holding the link, and a
 * human chooses to send it. Same mechanism as the buyer order handoff.
 * Returns null when the number has no usable digits.
 */
export function whatsAppShareUrl(phone: string, message: string): string | null {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 6) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
