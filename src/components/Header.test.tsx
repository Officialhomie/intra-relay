import { createElement, type ReactNode } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Header } from "./Header";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", { href, ...props }, children),
}));

describe("Header", () => {
  it("renders the Intra brand and the reduced primary navigation", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "Intra" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: "For businesses" })).toHaveAttribute(
      "href",
      "/supplier/onboard",
    );
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("link", { name: /join as a business/i })).toHaveAttribute(
      "href",
      "/supplier/onboard",
    );
  });

  it("keeps operator-only surfaces out of the public header", () => {
    render(<Header />);

    expect(screen.queryByRole("link", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Operator" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Evidence" })).toBeNull();
  });
});
