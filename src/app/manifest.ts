import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

/**
 * PWA manifest (milestone 7 phase C §2). Next serves this at
 * `/manifest.webmanifest` and links it into every page automatically.
 *
 * `start_url` opens the buyer home (the workspace), not the marketing page, so
 * an installed launch lands where the person's work is. The app stays a normal
 * website — nothing here forces or blocks installation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — ${site.tagline}`,
    short_name: site.name,
    description:
      "Tell Intra what you need in plain words. It finds a real business, gets a real price, and leaves the decision and the payment with you.",
    start_url: "/agent",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffefc",
    theme_color: "#0f3e17",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
