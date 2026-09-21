import type { BusinessCategory } from "@/features/businesses/schema";
import { FLYER_PRINTING_ROUTE_SLUG } from "@/features/routes/flyer-printing";
import { SERVICE_TEMPLATES } from "@/features/routes/templates";

import type { UserIntent } from "./types";

/**
 * Domain capability adapters (milestone 6 §28; milestone 10.6).
 *
 * The intent layer must not be wired to flyer printing. It asks this registry
 * "can the platform currently serve this category, and if so through which
 * workflow?". Printing is backed by the real quote route; every other category
 * is represented and routed but has no provider network yet — the honest answer
 * is "not available", not a fake marketplace (CLAUDE.md §4.1, milestone 6 §35).
 *
 * Adding a domain later is a new entry here plus its route template — not a new
 * agent or a fork of this layer.
 *
 * CANONICAL CATEGORY VOCABULARY (M10.6, ADR-025 continuation): `category` is
 * typed `BusinessCategory` — the SAME enum `businesses.category` uses — so
 * demand and supply can no longer silently drift onto different identifiers.
 * A buyer-facing concept that has no real marketplace category of its own
 * (there is no `BusinessCategory` or `ServiceTemplate` for "electronics" or
 * "repair" — no route, no supplier network) maps onto `"other"`, the same
 * bucket the supply side already uses for exactly this situation. That is
 * never a fabricated new category; it is naming what is really there, and it
 * costs nothing to fix now because `"other"` already exists on both sides.
 *
 * This is deliberately a DIFFERENT thing from `slug`: `slug` is the
 * fine-grained, buyer-facing identifier this entry answers to — the value
 * that lands on `UserIntent.category`, the value the Haiku fallback
 * classifies into (`KNOWN_CATEGORIES`), and the value `resolveDomain` looks
 * entries up by. Two entries MAY share a canonical `category` (electronics
 * and repair both map to "other") without becoming ambiguous, because lookup
 * never keys on `category` — only ever on `slug`/`aliases`. Presentation
 * (the specific "no electronics sellers yet" vs "no repair businesses yet"
 * messaging) lives entirely on the fine-grained entry, untouched by which
 * canonical bucket it reports up to.
 */

export interface DomainCapability {
  /**
   * The fine-grained, buyer-facing identifier this domain answers to — what
   * `UserIntent.category` holds, what `resolveDomain` is called with, and
   * what the model-assisted classifier (`assist.ts`) chooses between. NOT a
   * marketplace category; see `category` for that.
   */
  slug: string;
  /**
   * The canonical marketplace category this maps onto (`businesses.category`
   * / `BusinessCategory`) — the real supply-side bucket, even when several
   * `slug`s share one (see file doc comment). This is what should be compared
   * against supply data, sent to analytics, or used to group by category.
   */
  category: BusinessCategory;
  aliases: readonly string[];
  label: string;
  /**
   * Whether a provider workflow exists for it today. DERIVED, not hand-set —
   * see `deriveServiceable` below — from whether `routeSlug` names a template
   * whose `availability` is `"mvp"`. This is milestone 10.6 item 4's fix:
   * before this, `DomainCapability.serviceable` and `ServiceTemplate.availability`
   * were two independent booleans about the same fact, kept in sync only by
   * hand. Now there is exactly one source of truth (the template catalogue)
   * and this field reads it, so a category can never appear operationally
   * available here while no real supply capability backs it.
   */
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

/** A route slug is live supply only if its template is actually MVP — the
 * single source of truth for "is this real today", read from the same
 * catalogue the supply side (`routes/service.ts`, onboarding) uses to create
 * routes. No route slug ⇒ no supply at all ⇒ never serviceable. */
function deriveServiceable(routeSlug: string | null): boolean {
  if (!routeSlug) return false;
  const template = SERVICE_TEMPLATES.find((t) => t.id === routeSlug);
  return template?.availability === "mvp";
}

const PRINTING: DomainCapability = {
  slug: "printing",
  category: "printing",
  aliases: ["print", "printing", "copy", "copying", "reprographics"],
  label: "printing and copying",
  serviceable: deriveServiceable(FLYER_PRINTING_ROUTE_SLUG),
  routeSlug: FLYER_PRINTING_ROUTE_SLUG,
  // The flyer-printing quote route rejects a brief missing any of these, so the
  // agent must not spend a fee or a printer's time on an incomplete one.
  requiredForQuote: ["service", "quantity", "size", "colour", "deadline", "location"],
  unavailableNote: "",
};

const COMING_SOON: readonly DomainCapability[] = [
  {
    // Buyer-facing trigger word stays "food" — informal, natural language,
    // exactly what someone hungry actually types. The real marketplace
    // category behind it is "catering" (`event-catering-quote` already
    // exists as a template; "food" does not and never will be a
    // `BusinessCategory`). "catering" is already one of this entry's own
    // aliases below, which is the tell that the mapping was always implicit —
    // this makes it the explicit, typed source of truth instead.
    slug: "food",
    category: "catering",
    aliases: ["food", "dinner", "lunch", "restaurant", "catering", "meal"],
    label: "food and catering",
    serviceable: deriveServiceable(null),
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "Intra doesn't have food businesses on the platform yet, so I can't get you real prices or place an order for that.",
  },
  {
    // No BusinessCategory/ServiceTemplate exists for "electronics" — mapping
    // it onto a category of its own would fabricate marketplace supply that
    // isn't there. "other" is the real, existing catch-all bucket.
    slug: "electronics",
    category: "other",
    aliases: ["electronics", "phone", "laptop", "device", "gadget"],
    label: "phones and electronics",
    serviceable: deriveServiceable(null),
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "There are no electronics sellers on Intra yet, so I can't check real listings or prices for a phone.",
  },
  {
    slug: "design",
    category: "design",
    aliases: ["design", "graphic", "logo", "artwork", "branding"],
    label: "design",
    serviceable: deriveServiceable(null),
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "Design businesses aren't live on Intra yet — I can't get you a real quote for that one.",
  },
  {
    slug: "delivery",
    category: "delivery",
    aliases: ["delivery", "courier", "dispatch", "errand"],
    label: "delivery and errands",
    serviceable: deriveServiceable(null),
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote: "There are no delivery businesses on Intra yet, so I can't arrange that.",
  },
  {
    // Same reasoning as electronics: no "repair" category or template exists.
    slug: "repair",
    category: "other",
    aliases: ["repair", "fix", "device-repair"],
    label: "repairs",
    serviceable: deriveServiceable(null),
    routeSlug: null,
    requiredForQuote: [],
    unavailableNote:
      "Repair businesses aren't on the platform yet, so I can't get you a real quote for a repair.",
  },
];

const ALL: readonly DomainCapability[] = [PRINTING, ...COMING_SOON];

/** Every fine-grained buyer-facing identifier the platform currently knows
 * about, serviceable or not — NOT the canonical category list (several of
 * these share one canonical `category`; see the file doc comment). This is
 * what `resolveDomain` and the model-assisted classifier operate over. */
export const KNOWN_CATEGORIES: readonly string[] = ALL.map((d) => d.slug);

/** A compact, model-facing description of the known (fine-grained) categories
 * (milestone 10.4). The outward field is still called "category" for
 * continuity with the existing classification prompt/schema — it carries
 * each entry's `slug`, not its canonical marketplace `category`. */
export function describeCategoriesForModel(): {
  category: string;
  label: string;
  examples: string[];
}[] {
  return ALL.map((d) => ({ category: d.slug, label: d.label, examples: [...d.aliases] }));
}

export function resolveDomain(category: string | undefined): DomainCapability | null {
  if (!category) return null;
  const c = category.toLowerCase();
  return ALL.find((d) => d.slug === c || d.aliases.includes(c)) ?? null;
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
