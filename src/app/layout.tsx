import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MainContainer } from "@/components/MainContainer";
import { OfflineBanner } from "@/components/OfflineBanner";
import { site } from "@/lib/site";
import "@/styles/globals.css";

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
        <OfflineBanner />
        <Header />
        <MainContainer>{children}</MainContainer>
        <Footer />
      </body>
    </html>
  );
}
