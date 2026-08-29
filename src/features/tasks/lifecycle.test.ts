import { describe, expect, it } from "vitest";

import { HttpError } from "@/lib/http/response";

import { assertTaskTransition, canTransitionTask, isTaskTerminal } from "./lifecycle";

describe("task lifecycle (PRD §7)", () => {
  it("allows the documented path DRAFT → HANDOFF_READY", () => {
    expect(canTransitionTask("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionTask("SUBMITTED", "AWAITING_QUOTE")).toBe(true);
    expect(canTransitionTask("AWAITING_QUOTE", "RECOMMENDED")).toBe(true);
    expect(canTransitionTask("RECOMMENDED", "HANDOFF_READY")).toBe(true);
  });

  it("allows failure and cancellation from active states", () => {
    expect(canTransitionTask("SUBMITTED", "FAILED")).toBe(true);
    expect(canTransitionTask("AWAITING_QUOTE", "CANCELLED")).toBe(true);
  });

  it("forbids illegal jumps and moves out of terminal states", () => {
    expect(canTransitionTask("DRAFT", "AWAITING_QUOTE")).toBe(false);
    expect(canTransitionTask("DRAFT", "RECOMMENDED")).toBe(false);
    expect(canTransitionTask("HANDOFF_READY", "SUBMITTED")).toBe(false);
    expect(canTransitionTask("FAILED", "SUBMITTED")).toBe(false);
    expect(() => assertTaskTransition("DRAFT", "RECOMMENDED")).toThrow(HttpError);
  });

  it("classifies terminal states", () => {
    expect(isTaskTerminal("HANDOFF_READY")).toBe(true);
    expect(isTaskTerminal("FAILED")).toBe(true);
    expect(isTaskTerminal("CANCELLED")).toBe(true);
    expect(isTaskTerminal("AWAITING_QUOTE")).toBe(false);
  });
});
