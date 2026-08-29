/**
 * Static, non-secret app metadata and the canonical navigation map.
 * Feature code should import from here rather than redefining routes.
 */
export const site = {
  name: "Intra",
  description: "Intra — project scaffold.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

export const primaryNav = [
  { href: "/", label: "Home" },
  { href: "/request", label: "Request" },
  { href: "/supplier/onboard", label: "Supplier" },
  { href: "/operator", label: "Operator" },
  { href: "/docs", label: "Docs" },
] as const;
