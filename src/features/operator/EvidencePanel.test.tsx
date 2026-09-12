import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { TransactionTrace } from "@/features/evidence/trace";

import { TraceView } from "./EvidencePanel";

/**
 * Frontend audit Priority 5, Target 2: a human explanation up front, the full
 * technical evidence still available (never hidden, never deleted), and
 * "mock" never dressed up as a real on-chain guarantee.
 */
const BASE: TransactionTrace = {
  task: {
    id: "task-1",
    status: "HANDOFF_READY",
    createdAt: new Date().toISOString(),
    quotedAt: new Date().toISOString(),
    handoffConfirmedAt: new Date().toISOString(),
    buyerDecision: "ACCEPTED",
    buyerDecidedAt: new Date().toISOString(),
    buyerSessionPrefix: "abcd1234…",
  },
  provider: {
    businessName: "Campus Prints",
    routeName: "Flyer printing",
    payoutAddress: "0x1111111111111111111111111111111111111111",
    payoutAddressExplorer: null,
    providerAgentId: "0",
  },
  quotes: [],
  commitment: {
    jobRef: "job-1",
    status: "ATTESTED",
    buyerAddress: "0x2222222222222222222222222222222222222222",
    amountMinor: "1500000",
    currency: "NGN",
    assetAddress: "0x0",
    handoverCommit: "0xabc",
    schemaUid: "0xschema-commit",
    attestationUid: "0xuid-commit",
    attestationUidExplorer: null,
    attestationTxHash: "0xtx-commit",
    attestationTxExplorer: null,
    attestationMode: "mock",
    attestedAt: new Date().toISOString(),
  },
  handover: {
    status: "ATTESTED",
    outcome: "COMPLETED",
    fulfilledAt: new Date().toISOString(),
    attesterAddress: "0x3333333333333333333333333333333333333333",
    refUid: "0xuid-commit",
    schemaUid: "0xschema-handover",
    attestationUid: "0xuid-handover",
    attestationUidExplorer: null,
    attestationTxHash: "0xtx-handover",
    attestationTxExplorer: null,
    attestationMode: "mock",
    attestedAt: new Date().toISOString(),
    signedByProvider: false,
  },
  payments: [],
  orderPayment: null,
  timeline: [{ type: "task.handoff_confirmed", at: new Date().toISOString() }],
  consistency: {
    commitmentAttested: true,
    handoverAttested: true,
    handoverReferencesCommitment: true,
    paymentRecipientMatchesPayout: null,
    orderPaymentConfirmed: false,
    anySimulated: true,
  },
  disclaimer: "This records acknowledged protocol participation, not a quality check.",
};

describe("TraceView — evidence summary", () => {
  it("leads with a plain-language summary, not a raw status", () => {
    render(<TraceView trace={BASE} />);
    // taskStatusLabel(HANDOFF_READY) — shown both as the summary badge and,
    // consistently, in place of the raw status in the technical detail.
    expect(screen.getAllByText("Ready to send").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("HANDOFF_READY")).toBeNull();
  });

  it("never upgrades a mock attestation to sound real", () => {
    render(<TraceView trace={BASE} />);
    // Honest, plain language — appears at least once in the summary.
    expect(
      screen.getAllByText(/demo attestation/i).length +
        screen.getAllByText(/simulated, not on-chain/i).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/verified on-chain/i)).toBeNull();
    expect(screen.queryByText(/^Verified$/)).toBeNull();
  });

  it("keeps the technical detail available — schema UIDs and raw status still present", async () => {
    const user = userEvent.setup();
    render(<TraceView trace={BASE} />);

    // Progressive disclosure, not deletion: expand "Technical details".
    const toggle = screen.getByRole("button", { name: /technical details/i });
    if (toggle.getAttribute("aria-expanded") === "false") {
      await user.click(toggle);
    }

    expect(screen.getByText("0xschema-commit")).toBeInTheDocument();
    expect(screen.getByText("0xschema-handover")).toBeInTheDocument();
    // Raw commitment/handover status stays in the technical section as-is —
    // no existing canonical label for these two enums (unlike task status).
    expect(screen.getAllByText("ATTESTED").length).toBe(2);
  });

  it("humanises a mismatch without softening it into vague copy", async () => {
    const user = userEvent.setup();
    const mismatched: TransactionTrace = {
      ...BASE,
      consistency: { ...BASE.consistency, handoverReferencesCommitment: false },
    };
    render(<TraceView trace={mismatched} />);

    const toggle = screen.getByRole("button", { name: /technical details/i });
    if (toggle.getAttribute("aria-expanded") === "false") {
      await user.click(toggle);
    }

    expect(screen.queryByText("MISMATCH")).toBeNull();
    // Both the technical row and the plain-language summary state it.
    expect(screen.getAllByText(/does not reference the commitment/i).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getByText(/this trace is inconsistent/i)).toBeInTheDocument();
  });

  it("handles a task with no commitment or handover yet, without inventing evidence", () => {
    const bare: TransactionTrace = { ...BASE, commitment: null, handover: null };
    render(<TraceView trace={bare} />);

    expect(screen.getByText(/no commitment attestation has been recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/no handover attestation has been recorded/i)).toBeInTheDocument();
  });
});
