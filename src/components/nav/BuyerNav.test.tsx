import { createElement, type ReactNode } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", { href, ...props }, children),
}));

import { BuyerBottomNav } from "./BuyerBottomNav";
import { BuyerSideRail } from "./BuyerSideRail";

describe("BuyerBottomNav", () => {
  it("marks the current destination active and the others not", () => {
    render(<BuyerBottomNav pathname="/requests" attention={null} />);

    expect(screen.getByRole("link", { name: /requests/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^home$/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /activity/i })).not.toHaveAttribute("aria-current");
  });

  it("shows no attention badge when nothing needs the buyer", () => {
    render(<BuyerBottomNav pathname="/agent" attention={0} />);
    expect(screen.queryByText(/need your attention/i)).toBeNull();
  });

  it("shows a labelled attention badge on Requests, derived from the real count", () => {
    render(<BuyerBottomNav pathname="/agent" attention={2} />);
    const requestsLink = screen.getByRole("link", { name: /requests/i });
    expect(requestsLink).toHaveTextContent("2");
    expect(screen.getByText(/2 need your attention/i)).toBeInTheDocument();
  });
});

describe("BuyerSideRail", () => {
  it("marks the current destination active and links the mark to the marketing site", () => {
    render(<BuyerSideRail pathname="/activity" attention={null} />);

    expect(screen.getByRole("link", { name: /activity/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Intra" })).toHaveAttribute("href", "/");
  });

  it("carries the same attention badge as the bottom nav", () => {
    render(<BuyerSideRail pathname="/tasks/t1" attention={1} />);
    expect(screen.getByText(/1 need your attention/i)).toBeInTheDocument();
  });
});
