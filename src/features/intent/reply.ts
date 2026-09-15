import type { DomainCapability } from "./domain";
import type { IntentReading, UserIntent } from "./types";

/**
 * The words the conversational layer says when it is not starting a workflow
 * (milestone 6 §23–§27). Plain language, no enums, no internal reasoning, no
 * over-promising (§21: no guaranteed customers / revenue / ranking).
 */

/** Field-level prompts for progressive collection (milestone 6 §3, §13). */
const FIELD_PROMPT: Record<string, string> = {
  category: "What kind of service or product are you looking for?",
  service: "What exactly do you need?",
  quantity: "How many do you need?",
  size: "What paper size?",
  colour: "Full colour or black and white?",
  deadline: "When do you need it by?",
  location: "Which area are you in, or where should it go?",
  budget: "Do you have a budget in mind?",
  condition: "New or used?",
};

/**
 * A short, human read-back of what the person has told us so far — so the
 * conversation visibly remembers (milestone 7 §8). Never shows a field they
 * have not mentioned.
 */
export function summariseIntent(intent: UserIntent): string {
  const parts: string[] = [];
  const what = intent.service ?? intent.category;
  if (intent.quantity !== undefined && what)
    parts.push(`${intent.quantity.toLocaleString()} ${what}`);
  else if (intent.quantity !== undefined) parts.push(intent.quantity.toLocaleString());
  else if (what) parts.push(what);
  if (intent.size) parts.push(intent.size);
  if (intent.colour) parts.push(intent.colour);
  if (intent.deadline?.phrase) {
    parts.push(
      /^by\b/i.test(intent.deadline.phrase)
        ? intent.deadline.phrase
        : `by ${intent.deadline.phrase}`,
    );
  }
  if (intent.location) parts.push(`to ${intent.location}`);
  return parts.join(", ");
}

export function describeMissing(missing: (keyof UserIntent)[], known?: UserIntent): string {
  const prompts = missing.map((f) => FIELD_PROMPT[f as string]).filter(Boolean);
  const ack = known ? summariseIntent(known) : "";
  const lead = ack ? `Got it — ${ack}. ` : "";
  if (prompts.length === 0) {
    return `${lead}Tell me a bit more and I'll find the right business.`.trim();
  }
  if (prompts.length === 1) {
    return ack
      ? `${lead}${prompts[0]}`
      : `I can find the right business — ${prompts[0].charAt(0).toLowerCase()}${prompts[0].slice(1)}`;
  }
  const list = prompts.map((p) => p.replace(/\?$/, "")).join("; ");
  return ack
    ? `${lead}A couple more things: ${list}?`
    : `A couple of things and I can start looking: ${list}?`;
}

export function conversationalReply(reading: IntentReading, intent: UserIntent): string {
  if (reading.signals.includes("greeting")) {
    return "Hi — I can help you find a business on Intra and get a real price for a job. What do you need?";
  }
  if (reading.signals.includes("thanks")) {
    return "Anytime. Let me know if there's anything else you need.";
  }
  if (intent.category || intent.service) {
    return "Got it. Tell me a bit more about what you need and I'll see who can help.";
  }
  return "I'm here to help you get something done through a real business. What are you after?";
}

export function informationalReply(intent: UserIntent, serviceable: DomainCapability[]): string {
  const list = serviceable.map((d) => d.label).join(", ");
  const base =
    serviceable.length > 0
      ? `Right now Intra can get you real quotes for ${list}. You tell me what you need, I ask the businesses, and you decide — I never send an order or pay for you.`
      : "Intra connects you to real businesses for a job, gets you a quote, and leaves the decision and the payment with you.";
  if (intent.category) {
    // `intent.category` holds the fine-grained buyer identifier (e.g.
    // "printing"), which is `DomainCapability.slug` — not the canonical
    // marketplace `category`, which several entries can share (M10.6).
    const match = serviceable.find((d) => d.slug === intent.category);
    if (match) {
      return `Yes — ${match.label} is on Intra. Tell me the details and I'll get you a price.`;
    }
    return `${base} That category isn't on the platform yet, so I can't get you a real price for it.`;
  }
  return base;
}
