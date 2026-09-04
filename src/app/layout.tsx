import type { Metadata, Viewport } from "next";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MainContainer } from "@/components/MainContainer";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorker } from "@/features/pwa/ServiceWorker";
import { site } from "@/lib/site";
import "@/styles/globals.css";

export const viewport: Viewport = {
  themeColor: "#0f3e17",
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
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
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
        <OfflineBanner />
        <Header />
        <MainContainer>{children}</MainContainer>
        <Footer />
      </body>
    </html>
  );
}
