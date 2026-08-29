import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Request" };

export default function RequestPage() {
  return <PlaceholderPage title="Request" />;
}
