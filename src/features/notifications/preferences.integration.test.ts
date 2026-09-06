// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";

import { DEFAULT_PREFERENCES, getPreferences, setPreferences } from "./preferences";

/**
 * Notification preferences (milestone 7 phase C §16). Two switches, defaults
 * off, one row per recipient, and always in the person's control.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

describe("preferences", () => {
  it("an absent row means the defaults (both off)", async () => {
    expect(await getPreferences(db, "BUYER", "nobody")).toEqual(DEFAULT_PREFERENCES);
  });

  it("a partial patch keeps the other switch, and is one row per recipient", async () => {
    await setPreferences(db, "BUYER", "person-a", { pushEnabled: true });
    expect(await getPreferences(db, "BUYER", "person-a")).toEqual({
      pushEnabled: true,
      pushInformational: false,
    });

    await setPreferences(db, "BUYER", "person-a", { pushInformational: true });
    expect(await getPreferences(db, "BUYER", "person-a")).toEqual({
      pushEnabled: true,
      pushInformational: true,
    });

    // Turning push off is always allowed.
    await setPreferences(db, "BUYER", "person-a", { pushEnabled: false });
    expect((await getPreferences(db, "BUYER", "person-a")).pushEnabled).toBe(false);
  });

  it("buyer and business namespaces are separate", async () => {
    await setPreferences(db, "BUYER", "shared-key", { pushEnabled: true });
    expect((await getPreferences(db, "BUSINESS", "shared-key")).pushEnabled).toBe(false);
  });
});
