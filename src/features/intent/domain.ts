import { FLYER_PRINTING_ROUTE_SLUG } from "@/features/routes/flyer-printing";

import type { UserIntent } from "./types";

/**
 * Domain capability adapters (milestone 6 §28).
 *
 * The intent layer must not be wired to flyer printing. It asks this registry
 * "can the platform currently serve this category, and if so through which
 * workflow?". Printing is backed by the real quote route; every other category
 * is represented and routed but has no provider network yet — the honest answer
 * is "not available", not a fake marketplace (CLAUDE.md §4.1, milestone 6 §35).
 *
 * Adding a domain later is a new entry here plus its route template — not a new
 * agent or a fork of this layer.
 */

export interface DomainCapability {
  /** The UserIntent.category value(s) this domain answers. */
  category: string;
  aliases: readonly string[];
  label: string;
  /** Whether a provider workflow exists for it today. */
  serviceable: boolean;
  /** The quote-route slug a QUOTE_REQUEST maps to, when serviceable. */
  routeSlug: string | null;
  /**
   * UserIntent fields a quote request needs for this domain. Domain-level, not
   * the route's field keys — the workflow maps these to its own schema.
   */
  requiredForQuote: readonly (keyof UserIntent)[];
  /** Shown when the domain is not serviceable. Never over-promises. */
  unavailableNote: string;
}

const PRINTING: DomainCapability = {
  category: "printing",
  aliases: ["print", "printing", "copy", "copying", "reprographics"],
  label: "printing and copying",
  serviceable: true,
  routeSlug: FLYER_PRINTING_ROUTE_SLUG,
  // The flyer-printing quote route rejects a brief missing any of these, so the
  // agent must not spend a fee or a printer's time on an incomplete one.
  requiredForQuote: ["service", "quantity", "size", "colour", "deadline", "location"],
  unavailableNote: "",
};

const COMING_SOON: readonly DomainCapability[] = [
  {
    category: "food",
    aliases: ["food", "dinner", "lunch", "restaurant", "catering", "meal"],
    label: "food and catering",
    serviceable: false,
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "Intra doesn't have food businesses on the platform yet, so I can't get you real prices or place an order for that.",
  },
  {
    category: "electronics",
    aliases: ["electronics", "phone", "laptop", "device", "gadget"],
    label: "phones and electronics",
    serviceable: false,
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "There are no electronics sellers on Intra yet, so I can't check real listings or prices for a phone.",
  },
  {
    category: "design",
    aliases: ["design", "graphic", "logo", "artwork", "branding"],
    label: "design",
    serviceable: false,
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "Design businesses aren't live on Intra yet — I can't get you a real quote for that one.",
  },
  {
    category: "delivery",
    aliases: ["delivery", "courier", "dispatch", "errand"],
    label: "delivery and errands",
    serviceable: false,
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote: "There are no delivery businesses on Intra yet, so I can't arrange that.",
  },
  {
    category: "repair",
    aliases: ["repair", "fix", "device-repair"],
    label: "repairs",
    serviceable: false,
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "Repair businesses aren't on the platform yet, so I can't get you a real quote for a repair.",
  },
];

const ALL: readonly DomainCapability[] = [PRINTING, ...COMING_SOON];

export function resolveDomain(category: string | undefined): DomainCapability | null {
  if (!category) return null;
  const c = category.toLowerCase();
  return ALL.find((d) => d.category === c || d.aliases.includes(c)) ?? null;
}

/** The categories a person could actually transact in today. */
export function serviceableCategories(): DomainCapability[] {
  return ALL.filter((d) => d.serviceable);
}

/** UserIntent fields still missing before this domain can request a quote. */
export function missingForQuote(
  domain: DomainCapability,
  intent: UserIntent,
): (keyof UserIntent)[] {
  return domain.requiredForQuote.filter((field) => intent[field] === undefined);
}
