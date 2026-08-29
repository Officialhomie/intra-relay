import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { OnboardingForm } from "./OnboardingForm";

const VALID_ADDRESS = `0x${"a".repeat(40)}`;

type User = ReturnType<typeof userEvent.setup>;

async function fillBusinessStep(user: User) {
  await user.type(screen.getByRole("textbox", { name: "Business name" }), "Campus Prints NG");
  await user.type(screen.getByRole("textbox", { name: "Authorised contact" }), "Ada Obi");
  await user.type(screen.getByRole("textbox", { name: "Order channel details" }), "+2348012345678");
  await user.type(screen.getByRole("textbox", { name: "City" }), "Lagos");
  // Country is prefilled.
}

async function advance(user: User) {
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

describe("OnboardingForm (F-SUP)", () => {
  let user: User;

  beforeEach(() => {
    user = userEvent.setup();
    render(<OnboardingForm />);
  });

  it("collects the required business fields across its steps (FR-SUP-001)", async () => {
    expect(screen.getByRole("textbox", { name: "Business name" })).toBeInTheDocument();
    await fillBusinessStep(user);
    await advance(user);

    expect(screen.getByRole("combobox", { name: "Business category" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Quote currency" })).toBeInTheDocument();
    await advance(user);

    expect(screen.getByRole("textbox", { name: "Public Celo payout address" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /consent/i })).toBeInTheDocument();
  });

  it("never asks for prohibited sensitive data (FR-SUP-003, NFR-SEC-001)", async () => {
    await fillBusinessStep(user);
    await advance(user);
    await advance(user);

    expect(
      screen.queryByRole("textbox", {
        name: /seed phrase|mnemonic|private key|bvn|nin|card number|bank/i,
      }),
    ).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("does not advance an incomplete step and names the missing field (AC-SUP-001)", async () => {
    await advance(user);
    expect(await screen.findByText(/enter the business name/i)).toBeInTheDocument();
    // Still on the first step.
    expect(screen.getByRole("textbox", { name: "Business name" })).toBeInTheDocument();
    expect(screen.queryByText(/draft created/i)).toBeNull();
  });

  it("blocks the draft on an invalid payout address (AC-SUP-001)", async () => {
    await fillBusinessStep(user);
    await advance(user);
    await advance(user);
    await user.type(screen.getByRole("textbox", { name: "Public Celo payout address" }), "0x123");
    await user.click(screen.getByRole("checkbox", { name: /consent/i }));
    await user.click(screen.getByRole("button", { name: /create my capability draft/i }));

    expect(await screen.findByText(/valid public EVM\/Celo address/i)).toBeInTheDocument();
    expect(screen.queryByText(/draft created/i)).toBeNull();
  });

  it("creates a reviewable, non-live draft on a valid submission (AC-SUP-002, AC-SUP-003)", async () => {
    await fillBusinessStep(user);
    await advance(user);
    await advance(user);
    await user.type(
      screen.getByRole("textbox", { name: "Public Celo payout address" }),
      VALID_ADDRESS,
    );
    await user.click(screen.getByRole("checkbox", { name: /consent/i }));
    await user.click(screen.getByRole("button", { name: /create my capability draft/i }));

    expect(await screen.findByText(/draft created/i)).toBeInTheDocument();
    expect(screen.getByText("campus-prints-ng")).toBeInTheDocument();
    expect(screen.getByText("/supplier/campus-prints-ng/review")).toBeInTheDocument();
    expect(screen.getByText(/this route is a draft/i)).toBeInTheDocument();
    expect(screen.getByText(/not stored anywhere/i)).toBeInTheDocument();
  });
});
