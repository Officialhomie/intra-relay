import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HandoverCodeCard } from "./HandoverCodeCard";

/**
 * The buyer and merchant sides are opposites, not a color-swapped pair
 * (frontend audit Priority 6). Every assertion here checks user-facing
 * copy/structure, never implementation detail.
 */
describe("HandoverCodeCard — buyer mode", () => {
  it("shows the exact code, unmodified", () => {
    render(<HandoverCodeCard mode="buyer" code="7QK4M2XR" />);
    expect(screen.getByText("7QK4M2XR")).toBeInTheDocument();
  });

  it("uses present/show language, not receive/verify language", () => {
    render(<HandoverCodeCard mode="buyer" code="7QK4M2XR" />);
    expect(screen.getByText(/your collection code/i)).toBeInTheDocument();
    expect(screen.getByText(/you present this/i)).toBeInTheDocument();
    expect(screen.getByText(/say this to the business/i)).toBeInTheDocument();
    expect(screen.queryByText(/ask the customer/i)).toBeNull();
    expect(screen.queryByText(/verify/i)).toBeNull();
  });

  it("renders nothing before a code exists — never a placeholder or fabricated value", () => {
    const { container } = render(<HandoverCodeCard mode="buyer" code={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HandoverCodeCard — merchant mode", () => {
  it("frames the code as the customer's, not the merchant's own", () => {
    render(
      <HandoverCodeCard mode="merchant">
        <input aria-label="Code from the customer" />
      </HandoverCodeCard>,
    );
    expect(screen.getByText(/customer's collection code/i)).toBeInTheDocument();
    expect(screen.getByText(/ask the customer for their collection code/i)).toBeInTheDocument();
    // Never claims the merchant is the one presenting a code.
    expect(screen.queryByText(/your collection code/i)).toBeNull();
    expect(screen.queryByText(/you present this/i)).toBeNull();
  });

  it("renders the caller's own verification interface unchanged", () => {
    render(
      <HandoverCodeCard mode="merchant">
        <input aria-label="Code from the customer" />
        <button>Confirm handover</button>
      </HandoverCodeCard>,
    );
    expect(screen.getByRole("textbox", { name: /code from the customer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm handover/i })).toBeInTheDocument();
  });
});

describe("HandoverCodeCard — direction is unambiguous even without full copy", () => {
  it("buyer and merchant never share the same heading", () => {
    const { unmount } = render(<HandoverCodeCard mode="buyer" code="ABC123" />);
    const buyerHeading = screen.getByRole("heading").textContent;
    unmount();

    render(
      <HandoverCodeCard mode="merchant">
        <input aria-label="Code from the customer" />
      </HandoverCodeCard>,
    );
    // The merchant side's "heading" is a styled paragraph, not an <h*> — assert
    // on the visible text directly instead.
    expect(screen.getByText(/customer's collection code/i).textContent).not.toBe(buyerHeading);
  });
});
