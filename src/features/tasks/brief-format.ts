/**
 * Plain-language rendering of a structured brief (frontend audit §22,
 * Priority 5). The one place that turns a brief's raw keys/values into
 * something a person reads — the buyer's own task page and the WhatsApp
 * order message both go through this, so a buyer never sees `deliveryArea:`
 * on one surface and "Delivery / pick-up" on another.
 */

const BRIEF_FIELD_LABEL: Record<string, string> = {
  size: "Paper size",
  quantity: "How many",
  colour: "Colour",
  deadline: "Needed by",
  deliveryArea: "Delivery / pick-up",
  pages: "Pages",
  copies: "Copies",
  device: "Device",
  fault: "What is wrong",
};

/** A plain-language label for a brief field key — never the raw camelCase key. */
export function briefFieldLabel(key: string): string {
  return (
    BRIEF_FIELD_LABEL[key] ??
    key.charAt(0).toUpperCase() +
      key
        .slice(1)
        .replace(/([A-Z])/g, " $1")
        .toLowerCase()
  );
}

/** A plain-language value for a brief field — e.g. "full-colour" → "Full colour". */
export function briefFieldValue(key: string, value: unknown): string {
  const raw = String(value).trim();
  if (key === "colour") {
    const v = raw.toLowerCase().replace(/-/g, " ");
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  return raw;
}
