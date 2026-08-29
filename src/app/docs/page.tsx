import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage() {
  return <PlaceholderPage title="Docs" />;
}
