import { afterEach, describe, expect, it, vi } from "vitest";

import { isAllowedKey, REDACTION_DENYLIST, sanitizeProps } from "./properties";

describe("sanitizeProps — redaction (M9.5 §26, §42)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("drops every denylisted key", () => {
    const props: Record<string, unknown> = {};
    for (const key of REDACTION_DENYLIST) props[key] = "value";
    // camelCase / snake_case variants normalise to the same denied key
    props.manageToken = "tok";
    props.tx_hash = "0xabc";
    props.handoverCode = "ABCD1234";

    expect(sanitizeProps(props as Record<string, string>)).toEqual({});
  });

  it("keeps safe primitive props unchanged", () => {
    expect(
      sanitizeProps({
        role: "buyer",
        turn_count: 3,
        has_deadline: true,
        option_rank: null,
        category: "printing",
      }),
    ).toEqual({
      role: "buyer",
      turn_count: 3,
      has_deadline: true,
      option_rank: null,
      category: "printing",
    });
  });

  it("drops non-primitive values (objects, arrays, functions)", () => {
    const props = {
      ok: "yes",
      nested: { a: 1 },
      list: [1, 2, 3],
      fn: () => 1,
    } as unknown as Record<string, string>;
    expect(sanitizeProps(props)).toEqual({ ok: "yes" });
  });

  it("drops non-finite numbers", () => {
    expect(sanitizeProps({ n: Number.NaN, m: Infinity, ok: 1 })).toEqual({ ok: 1 });
  });

  it("truncates long strings as a free-text guard", () => {
    const long = "x".repeat(500);
    const out = sanitizeProps({ blob: long });
    expect((out.blob as string).length).toBe(200);
  });

  it("warns in development, never throws", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => sanitizeProps({ email: "a@b.com" })).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it("handles null / undefined input", () => {
    expect(sanitizeProps(null)).toEqual({});
    expect(sanitizeProps(undefined)).toEqual({});
    expect(sanitizeProps({ a: undefined, b: 1 })).toEqual({ b: 1 });
  });
});

describe("isAllowedKey", () => {
  it("rejects secret-bearing keys wherever the fragment appears", () => {
    expect(isAllowedKey("anthropic_api_key")).toBe(false);
    expect(isAllowedKey("userPassword")).toBe(false);
    expect(isAllowedKey("x-authorization-header")).toBe(false);
    expect(isAllowedKey("wallet_private_key")).toBe(false);
  });

  it("allows ordinary analytics keys", () => {
    for (const key of [
      "role",
      "environment",
      "turn_count",
      "has_budget",
      "pricing_model",
      "notification_channel",
      "option_count",
    ]) {
      expect(isAllowedKey(key)).toBe(true);
    }
  });
});
