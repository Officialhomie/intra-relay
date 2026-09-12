import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { HandoverAttestPanel, type HandoverPublicView } from "./HandoverAttestPanel";

/**
 * The merchant side of the two-party handover (frontend audit Priority 6).
 * No existing tests covered this component before — these are new, not a
 * duplicate of `HandoverCodeCard.test.tsx`, which only covers the shared
 * presentational frame.
 */
function handover(over: Partial<HandoverPublicView>): HandoverPublicView {
  return {
    status: "PENDING_CODE",
    provider: "eas",
    outcome: null,
    fulfilledAt: null,
    attestationUid: null,
    attestationTxHash: null,
    attestationMode: null,
    simulated: false,
    ...over,
  };
}

describe("HandoverAttestPanel", () => {
  it("presents the customer's-code framing and a way to enter it, before any attempt", () => {
    render(<HandoverAttestPanel taskId="t1" manageToken="mt1" handover={null} />);
    expect(screen.getByText(/customer's collection code/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /code from the customer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm handover/i })).toBeInTheDocument();
  });

  it("explains an attestation failure without asking the customer to repeat their code", () => {
    render(
      <HandoverAttestPanel
        taskId="t1"
        manageToken="mt1"
        handover={handover({ status: "ATTESTATION_FAILED" })}
      />,
    );
    expect(screen.getByText(/didn't go through/i)).toBeInTheDocument();
    expect(screen.getByText(/without re-asking for the code/i)).toBeInTheDocument();
    // Still the same input, ready to retry.
    expect(screen.getByRole("textbox", { name: /code from the customer/i })).toBeInTheDocument();
  });

  it("shows a simulated attestation honestly, never as a real on-chain guarantee", () => {
    render(
      <HandoverAttestPanel
        taskId="t1"
        manageToken="mt1"
        handover={handover({
          status: "ATTESTED",
          simulated: true,
          attestationMode: "mock",
          fulfilledAt: "2026-01-01T00:00:00.000Z",
        })}
      />,
    );
    expect(screen.getByText(/handover confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/simulated — not on any real network/i)).toBeInTheDocument();
    expect(screen.queryByText(/view the record/i)).toBeNull();
    // Once attested, the code-entry interface is gone — nothing left to verify.
    expect(screen.queryByRole("textbox", { name: /code from the customer/i })).toBeNull();
  });

  it("links to the real record when the attestation genuinely went on-chain", () => {
    render(
      <HandoverAttestPanel
        taskId="t1"
        manageToken="mt1"
        handover={handover({
          status: "ATTESTED",
          simulated: false,
          attestationMode: "onchain",
          attestationUid: `0x${"ab".repeat(32)}`,
          fulfilledAt: "2026-01-01T00:00:00.000Z",
        })}
      />,
    );
    expect(screen.getByText(/handover confirmed/i)).toBeInTheDocument();
    expect(screen.queryByText(/simulated/i)).toBeNull();
    expect(screen.getByRole("link", { name: /view the record/i })).toBeInTheDocument();
  });
});
