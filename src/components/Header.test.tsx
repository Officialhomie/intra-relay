import { createElement, type ReactNode } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Header } from "./Header";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", { href, ...props }, children),
}));

describe("Header", () => {
  it("renders the Intra brand and primary navigation links", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "Intra" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Request" })).toHaveAttribute("href", "/request");
    expect(screen.getByRole("link", { name: "Supplier" })).toHaveAttribute(
      "href",
      "/supplier/onboard",
    );
    expect(screen.getByRole("link", { name: "Operator" })).toHaveAttribute("href", "/operator");
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
  });
});
