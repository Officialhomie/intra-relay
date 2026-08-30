import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { OnboardingForm } from "./OnboardingForm";

const VALID_ADDRESS = `0x${"a".repeat(40)}`;

type User = ReturnType<typeof userEvent.setup>;

async function advance(user: User) {
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

async function fillBusinessStep(user: User) {
  await user.type(screen.getByRole("textbox", { name: "Business name" }), "Campus Prints NG");
  await user.type(screen.getByRole("textbox", { name: "Authorised contact" }), "Ada Obi");
  await user.type(screen.getByRole("textbox", { name: "WhatsApp number" }), "+2348012345678");
  await user.type(screen.getByRole("textbox", { name: "City" }), "Lagos");
  // Country is prefilled.
}

async function fillAreaStep(user: User) {
  await user.type(screen.getByRole("textbox", { name: "Service area" }), "UNILAG campus and Akoka");
  await user.type(screen.getByRole("textbox", { name: "Opening hours" }), "Mon-Sat, 9am-6pm");
  await user.type(
    screen.getByRole("textbox", { name: "Typical turnaround" }),
    "Same day if approved before noon",
  );
}

async function fillServiceStep(user: User) {
  await user.type(
    screen.getByRole("textbox", { name: "What can this service do?" }),
    "A5 and A4 flyer printing, full-colour or black-and-white.",
  );
  // Category, response time, and currency have valid defaults.
}

/** Walk to the final consent step with every prior step valid. */
async function goToConsentStep(user: User) {
  await fillBusinessStep(user);
  await advance(user);
  await fillAreaStep(user);
  await advance(user);
  await fillServiceStep(user);
  await advance(user);
}

describe("OnboardingForm (F-SUP)", () => {
  let user: User;

  beforeEach(() => {
    user = userEvent.setup();
    render(<OnboardingForm />);
  });

  it("collects identity, WhatsApp, service, area, hours, turnaround, and response time (FR-SUP-001, FR-SUP-005)", async () => {
    expect(screen.getByRole("textbox", { name: "Business name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "WhatsApp number" })).toBeInTheDocument();
    await fillBusinessStep(user);
    await advance(user);

    expect(screen.getByRole("textbox", { name: "Service area" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Opening hours" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Typical turnaround" })).toBeInTheDocument();
    await fillAreaStep(user);
    await advance(user);

    expect(screen.getByRole("combobox", { name: "Business category" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "What can this service do?" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "How quickly do you reply to a quote request?" }),
    ).toBeInTheDocument();
    await fillServiceStep(user);
    await advance(user);

    expect(
      screen.getByRole("checkbox", { name: /consent to Intra requesting a quote/i }),
    ).toBeInTheDocument();
  });

  it("never asks for prohibited sensitive data or a street address (FR-SUP-003, NFR-SEC-001)", async () => {
    await goToConsentStep(user);

    expect(
      screen.queryByRole("textbox", {
        name: /seed phrase|mnemonic|private key|bvn|nin|card number|bank|street|home address/i,
      }),
    ).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("does not advance an incomplete step and names the missing field (AC-SUP-001, FR-TASK-003)", async () => {
    await advance(user);
    expect(await screen.findByText(/enter the business name/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Business name" })).toBeInTheDocument();
    expect(screen.queryByText(/your capability card/i)).toBeNull();
  });

  it("only requires a payout address when paid agent queries are enabled (payout only if required)", async () => {
    await goToConsentStep(user);
    // Default: paid queries ON, payout field shown.
    expect(screen.getByRole("textbox", { name: "Public Celo payout address" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /let ai agents pay a small fee/i }));
    expect(screen.queryByRole("textbox", { name: "Public Celo payout address" })).toBeNull();
    expect(screen.getByText(/no payout address needed/i)).toBeInTheDocument();
  });

  it("blocks the preview on an invalid payout address (AC-SUP-001)", async () => {
    await goToConsentStep(user);
    await user.type(screen.getByRole("textbox", { name: "Public Celo payout address" }), "0x123");
    await user.click(
      screen.getByRole("checkbox", { name: /consent to Intra requesting a quote/i }),
    );
    await user.click(screen.getByRole("button", { name: /preview my capability card/i }));

    expect(await screen.findByText(/valid public EVM\/Celo address/i)).toBeInTheDocument();
    expect(screen.queryByText(/your capability card/i)).toBeNull();
  });

  it("shows a plain-language Capability Card preview that does not imply an AI agent (AC-SUP-002, AC-SUP-003)", async () => {
    await goToConsentStep(user);
    await user.type(
      screen.getByRole("textbox", { name: "Public Celo payout address" }),
      VALID_ADDRESS,
    );
    await user.click(
      screen.getByRole("checkbox", { name: /consent to Intra requesting a quote/i }),
    );
    await user.click(screen.getByRole("button", { name: /preview my capability card/i }));

    expect(
      await screen.findByRole("heading", { name: /your capability card/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/draft — not live/i)).toBeInTheDocument();
    expect(screen.getByText(/UNILAG campus and Akoka/)).toBeInTheDocument();
    expect(screen.getByText(/public to agents once active/i)).toBeInTheDocument();
    // Explicitly disclaims AI agent / MCP / auto-accept.
    expect(
      screen.getByText(/does not give your business an AI agent, an MCP server/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/what the service states mean/i)).toBeInTheDocument();
    expect(screen.getByText("/supplier/campus-prints-ng/review")).toBeInTheDocument();
  });
});
