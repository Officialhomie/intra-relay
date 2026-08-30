/**
 * Static, non-secret app metadata and the canonical navigation map.
 * Feature code should import from here rather than redefining routes.
 */
export const site = {
  name: "Intra",
  tagline: "The trusted business layer for AI-agent commerce",
  description:
    "Intra turns one real business service into an agent-readable quote route. An AI agent sends a structured brief, gets a genuine quote from a verified printer, and hands a pre-filled WhatsApp order back to a human for approval. Intra never custodies funds or places the final order.",
  ogDescription:
    "One real business service, published as an agent-readable quote route: structured brief in, a genuine printer quote out, a human-approved WhatsApp handoff. No custody, no auto-payment.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

export const primaryNav = [
  { href: "/", label: "Home" },
  { href: "/request", label: "Request" },
  { href: "/supplier/onboard", label: "Supplier" },
  { href: "/operator", label: "Operator" },
  { href: "/docs", label: "Docs" },
] as const;
