import type { Metadata } from "next";

import { SectionHeader } from "@/components/ui/Section";
import { OperatorConsole } from "@/features/operator/OperatorConsole";

export const metadata: Metadata = { title: "Operator" };

export default function OperatorPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Operator"
        title="Route review and verification"
        description="Verify supplier data before a route goes live, and pause any route immediately if its data is stale or consent is withdrawn."
      />
      <OperatorConsole />
    </div>
  );
}
