import { describe, expect, it } from "vitest";

import { isEvmAddressFormat, normalizeEvmAddress, shortenEvmAddress } from "./address";

const FORTY_HEX = "0123456789abcdefABCDEF0123456789abcdef01";

describe("isEvmAddressFormat (FR-SUP-002, AC-SUP-001)", () => {
  it("accepts 0x + 40 hex characters in any case, trimmed", () => {
    expect(isEvmAddressFormat(`0x${"a".repeat(40)}`)).toBe(true);
    expect(isEvmAddressFormat(`0x${"A".repeat(40)}`)).toBe(true);
    expect(isEvmAddressFormat(`  0x${FORTY_HEX}  `)).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isEvmAddressFormat("")).toBe(false);
    expect(isEvmAddressFormat("0x123")).toBe(false);
    expect(isEvmAddressFormat("a".repeat(42))).toBe(false); // missing 0x
    expect(isEvmAddressFormat(`0x${"a".repeat(39)}`)).toBe(false); // too short
    expect(isEvmAddressFormat(`0x${"a".repeat(41)}`)).toBe(false); // too long
    expect(isEvmAddressFormat(`0x${"g".repeat(40)}`)).toBe(false); // non-hex
  });
});

it("normalizeEvmAddress lower-cases and trims (ADR-005)", () => {
  expect(normalizeEvmAddress(`  0x${"A".repeat(40)} `)).toBe(`0x${"a".repeat(40)}`);
});

it("shortenEvmAddress abbreviates a valid address and passes other input through", () => {
  const address = `0x${"abcdef0123".repeat(4)}`;
  expect(shortenEvmAddress(address)).toBe("0xabcd…0123");
  expect(shortenEvmAddress("not-an-address")).toBe("not-an-address");
});
