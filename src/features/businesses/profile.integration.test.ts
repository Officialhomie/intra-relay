// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { auditEvents, businesses } from "@/lib/db/schema";
import { businessInput } from "@/test-support/factories";
import { createBusiness } from "@/features/businesses/service";

import { businessProfileSchema, updateBusinessProfile } from "./profile";

/**
 * Merchant self-service for basic details (M10.2B).
 *
 * The point of these tests is that "the merchant can fix their own typo" did
 * not quietly become "the merchant can edit their own verification state".
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

async function seed() {
  const business = await createBusiness(
    db,
    businessInput({ businessName: "Yaba Prints", contactChannelValue: "+2348012345678" }),
  );
  const [row] = await db.select().from(businesses).where(eq(businesses.id, business.id));
  return row;
}

const VALID = {
  businessName: "Yaba Prints Ltd",
  // Deliberately different from the factory default, so every one of the four
  // fields is genuinely a change.
  contactName: "Chidi Obi",
  contactChannelValue: "+2348099999999",
  city: "Ibadan",
};

describe("a merchant correcting their own details", () => {
  it("updates the permitted fields and persists them", async () => {
    const seeded = await seed();
    const result = await updateBusinessProfile(db, seeded.slug, seeded.manageToken, VALID);

    expect(result.business.name).toBe("Yaba Prints Ltd");
    expect(result.business.contactName).toBe("Chidi Obi");
    expect(result.business.contactChannelValue).toBe("+2348099999999");
    expect(result.business.city).toBe("Ibadan");

    const [stored] = await db.select().from(businesses).where(eq(businesses.id, seeded.id));
    expect(stored.name).toBe("Yaba Prints Ltd");
    expect(stored.city).toBe("Ibadan");
  });

  it("never changes the slug, so existing links and endpoints keep working", async () => {
    const seeded = await seed();
    await updateBusinessProfile(db, seeded.slug, seeded.manageToken, VALID);

    const [stored] = await db.select().from(businesses).where(eq(businesses.id, seeded.id));
    // The display name changed; the public identity did not.
    expect(stored.slug).toBe(seeded.slug);
    expect(stored.name).not.toBe(seeded.name);
  });

  it("records which fields changed, without recording their values", async () => {
    const seeded = await seed();
    await updateBusinessProfile(db, seeded.slug, seeded.manageToken, VALID);

    const events = await db.select().from(auditEvents).where(eq(auditEvents.businessId, seeded.id));
    const updated = events.find((e) => e.type === "business.profile_updated");
    expect(updated).toBeDefined();
    const data = updated!.data as { changed: string[] };
    expect(data.changed).toEqual(
      expect.arrayContaining(["businessName", "contactName", "contactChannelValue", "city"]),
    );
    // The merchant's phone number is personal data — the trail records the
    // fact of a change, never the value.
    expect(JSON.stringify(updated!.data)).not.toContain("+2348099999999");
  });

  it("is a no-op that writes nothing when nothing actually changed", async () => {
    const seeded = await seed();
    const result = await updateBusinessProfile(db, seeded.slug, seeded.manageToken, {
      businessName: seeded.name,
      contactName: seeded.contactName,
      contactChannelValue: seeded.contactChannelValue,
      city: seeded.city,
    });

    expect(result.changed).toEqual([]);
    const events = await db.select().from(auditEvents).where(eq(auditEvents.businessId, seeded.id));
    expect(events.filter((e) => e.type === "business.profile_updated")).toHaveLength(0);
  });
});

describe("authorisation", () => {
  it("refuses an edit with no manage token", async () => {
    const seeded = await seed();
    await expect(updateBusinessProfile(db, seeded.slug, null, VALID)).rejects.toMatchObject({
      code: "MANAGE_TOKEN_REQUIRED",
    });
  });

  it("refuses an edit with a wrong manage token", async () => {
    const seeded = await seed();
    await expect(
      updateBusinessProfile(db, seeded.slug, "not-the-right-token", VALID),
    ).rejects.toMatchObject({ code: "MANAGE_TOKEN_REQUIRED" });
  });

  it("one supplier cannot edit another supplier with their own valid token", async () => {
    const mine = await seed();
    const theirs = await createBusiness(
      db,
      businessInput({ businessName: "Someone Else Prints", contactChannelValue: "+2347000000000" }),
    );

    // A perfectly valid token — for the wrong business.
    await expect(
      updateBusinessProfile(db, theirs.slug, mine.manageToken, VALID),
    ).rejects.toMatchObject({ code: "MANAGE_TOKEN_REQUIRED" });

    const [untouched] = await db.select().from(businesses).where(eq(businesses.id, theirs.id));
    expect(untouched.name).toBe("Someone Else Prints");
  });
});

describe("what a merchant may not touch", () => {
  it("ignores operator-only fields even when they are sent alongside valid ones", async () => {
    const seeded = await seed();
    const now = new Date();

    await updateBusinessProfile(db, seeded.slug, seeded.manageToken, {
      ...VALID,
      // Not in the schema's output type — sent the way a hand-rolled request
      // would send it, to prove the whitelist holds at runtime too.
      ...({
        status: "ACTIVE",
        verifiedByOperatorAt: now,
        payoutAddress: `0x${"b".repeat(40)}`,
        slug: "hijacked-slug",
        manageToken: "attacker-chosen-token",
        consentAt: now,
        quoteCurrency: "USD",
      } as unknown as Record<string, never>),
    });

    const [stored] = await db.select().from(businesses).where(eq(businesses.id, seeded.id));
    expect(stored.status).toBe(seeded.status);
    expect(stored.verifiedByOperatorAt).toEqual(seeded.verifiedByOperatorAt);
    expect(stored.payoutAddress).toBe(seeded.payoutAddress);
    expect(stored.slug).toBe(seeded.slug);
    expect(stored.manageToken).toBe(seeded.manageToken);
    expect(stored.quoteCurrency).toBe(seeded.quoteCurrency);
    expect(stored.consentAt).toEqual(seeded.consentAt);
  });

  it("only exposes the four editable fields in its schema", () => {
    expect(Object.keys(businessProfileSchema.shape).sort()).toEqual([
      "businessName",
      "city",
      "contactChannelValue",
      "contactName",
    ]);
  });

  it("never returns the manage token in its result", async () => {
    const seeded = await seed();
    const result = await updateBusinessProfile(db, seeded.slug, seeded.manageToken, VALID);
    expect(JSON.stringify(result)).not.toContain(seeded.manageToken);
  });
});

describe("validation reuses the existing domain rules", () => {
  it("rejects a too-short business name with the onboarding message", () => {
    const parsed = businessProfileSchema.safeParse({ ...VALID, businessName: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("Enter the business name.");
    }
  });

  it("rejects a blank contact channel", () => {
    expect(businessProfileSchema.safeParse({ ...VALID, contactChannelValue: "" }).success).toBe(
      false,
    );
  });

  it("trims incoming values rather than storing padding", async () => {
    const seeded = await seed();
    const parsed = businessProfileSchema.parse({ ...VALID, city: "  Kano  " });
    await updateBusinessProfile(db, seeded.slug, seeded.manageToken, parsed);
    const [stored] = await db.select().from(businesses).where(eq(businesses.id, seeded.id));
    expect(stored.city).toBe("Kano");
  });
});
