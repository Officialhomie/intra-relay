import type { Metadata, Viewport } from "next";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MainContainer } from "@/components/MainContainer";
import { BuyerNavShell } from "@/components/nav/BuyerNavShell";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AnalyticsProvider } from "@/features/analytics/AnalyticsProvider";
import { ServiceWorker } from "@/features/pwa/ServiceWorker";
import { site } from "@/lib/site";
import "@/styles/globals.css";

export const viewport: Viewport = {
  themeColor: "#1f1e1d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  metadataBase: new URL(site.url),
  applicationName: site.name,
  keywords: [
    "AI agents",
    "agentic commerce",
    "Celo",
    "x402",
    "stablecoin payments",
    "quote routes",
    "Nigeria",
    "flyer printing",
    "procurement assistant",
  ],
  authors: [{ name: "Intra" }],
  appleWebApp: {
    capable: true,
    title: site.name,
    statusBarStyle: "default",
  },
  // Legacy alias some iOS versions still read for home-screen standalone mode.
  other: { "apple-mobile-web-app-capable": "yes" },
  // `icon` is intentionally omitted — Next 15 serves `src/app/icon.svg` as the
  // favicon automatically via the file-convention route.
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.ogDescription,
    url: site.url,
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.ogDescription,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <ServiceWorker />
        <AnalyticsProvider />
        <OfflineBanner />
        <Header />
        <BuyerNavShell>
          <MainContainer>{children}</MainContainer>
          <Footer />
        </BuyerNavShell>
      </body>
    </html>
  );
}
