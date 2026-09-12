import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { OperatorRouteCard } from "./OperatorConsole";

/**
 * Frontend audit Priority 5, Target 1: the operator queue must never leak a
 * raw enum where the existing `routeStatusLabel` convention already covers
 * the value — reusing the same helper the buyer-facing surfaces use.
 */
function item(status: string) {
  return {
    route: {
      id: "route-1",
      slug: "flyer-printing",
      name: "Flyer printing",
      status,
      responseSlaMinutes: 30,
      queryFeeUsd: "0.02",
      priceUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    business: {
      slug: "campus-prints",
      name: "Campus Prints",
      city: "Lagos",
      country: "Nigeria",
      consentAt: new Date().toISOString(),
      contactChannelType: "whatsapp",
      contactChannelValue: "+2348000000000",
      verifiedByOperatorAt: null,
    },
  };
}

describe("OperatorRouteCard status label", () => {
  it.each([
    ["PENDING_VERIFICATION", "Awaiting operator check"],
    ["ACTIVE", "Available to customers"],
    ["PAUSED", "Paused"],
    ["ARCHIVED", "Archived"],
    ["DRAFT", "Draft"],
  ])("renders %s as %s, never the raw enum", (status, label) => {
    render(<OperatorRouteCard item={item(status)} operatorKey="op-key" onChanged={vi.fn()} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    // The raw enum (underscored, upper-case) must not appear anywhere.
    expect(screen.queryByText(status)).toBeNull();
    expect(screen.queryByText(status.replace(/_/g, " "))).toBeNull();
  });

  it("falls back to a titleised label for a status with no explicit mapping", () => {
    render(
      <OperatorRouteCard item={item("SOME_NEW_STATUS")} operatorKey="op-key" onChanged={vi.fn()} />,
    );
    // routeStatusLabel's own fallback: lower-cased, underscores to spaces.
    expect(screen.getByText("some new status")).toBeInTheDocument();
  });
});
