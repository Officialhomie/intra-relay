import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StructuredRequestForm } from "./StructuredRequestForm";

/**
 * The "prefer a form?" secondary mode (frontend audit D6, Priority 4). It
 * must never call an API itself — only compose one sentence and hand it back,
 * so the caller sends it through the same pipeline as typed text.
 */
describe("StructuredRequestForm", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.clear(screen.getByRole("spinbutton", { name: /number of copies/i }));
    await user.type(screen.getByRole("spinbutton", { name: /number of copies/i }), "200");
    await user.type(screen.getByRole("textbox", { name: /needed by/i }), "Friday 3pm");
    await user.type(screen.getByRole("textbox", { name: /delivery or pick-up area/i }), "Yaba");
  }

  it("composes one sentence from the fields and never calls an API directly", async () => {
    const user = userEvent.setup();
    const onSubmitSentence = vi.fn();
    render(
      <StructuredRequestForm
        onSubmitSentence={onSubmitSentence}
        onCancel={vi.fn()}
        pending={false}
      />,
    );

    await fill(user);
    await user.click(screen.getByRole("button", { name: /send this request/i }));

    expect(onSubmitSentence).toHaveBeenCalledTimes(1);
    expect(onSubmitSentence.mock.calls[0][0]).toBe(
      "I need 200 A5 full-colour flyers by Friday 3pm, delivered to Yaba.",
    );
  });

  it("reflects a chip selection in the composed sentence", async () => {
    const user = userEvent.setup();
    const onSubmitSentence = vi.fn();
    render(
      <StructuredRequestForm
        onSubmitSentence={onSubmitSentence}
        onCancel={vi.fn()}
        pending={false}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "A4" }));
    await user.click(screen.getByRole("radio", { name: "Black and white" }));
    await fill(user);
    await user.click(screen.getByRole("button", { name: /send this request/i }));

    expect(onSubmitSentence.mock.calls[0][0]).toBe(
      "I need 200 A4 black-and-white flyers by Friday 3pm, delivered to Yaba.",
    );
  });

  it("blocks submission and shows an error when a required field is missing", async () => {
    const user = userEvent.setup();
    const onSubmitSentence = vi.fn();
    render(
      <StructuredRequestForm
        onSubmitSentence={onSubmitSentence}
        onCancel={vi.fn()}
        pending={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /send this request/i }));

    expect(onSubmitSentence).not.toHaveBeenCalled();
    expect(await screen.findByText(/tell the printer when you need them/i)).toBeInTheDocument();
  });

  it("calls onCancel to return to typing", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <StructuredRequestForm onSubmitSentence={vi.fn()} onCancel={onCancel} pending={false} />,
    );

    await user.click(screen.getByRole("button", { name: /back to typing/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
