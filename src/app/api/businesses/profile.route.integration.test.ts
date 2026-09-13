// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { businesses } from "@/lib/db/schema";
import { businessInput } from "@/test-support/factories";
import { createBusiness } from "@/features/businesses/service";

import { PATCH as profileRoute } from "./[slug]/profile/route";

/**
 * The profile-edit HTTP boundary (M10.2B). The service's own rules are tested
 * in `features/businesses/profile.integration.test.ts`; this is about the
 * wrapper: the token has to arrive as a header, and the endpoint must fail
 * closed without one.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const VALID = {
  businessName: "Yaba Prints Ltd",
  contactName: "Chidi Obi",
  contactChannelValue: "+2348099999999",
  city: "Ibadan",
};

async function seed() {
  const business = await createBusiness(db, businessInput({ businessName: "Yaba Prints" }));
  const [row] = await db.select().from(businesses).where(eq(businesses.id, business.id));
  return row;
}

function patch(slug: string, body: unknown, headers: Record<string, string> = {}) {
  return profileRoute(
    new Request(`http://localhost/api/businesses/${slug}/profile`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `test-${Math.random().toString(36).slice(2)}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

async function readJson(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("PATCH /api/businesses/[slug]/profile", () => {
  it("saves the change for a merchant presenting their manage token", async () => {
    const seeded = await seed();
    const res = await patch(seeded.slug, VALID, { "x-manage-token": seeded.manageToken });
    expect(res.status).toBe(200);

    const [stored] = await db.select().from(businesses).where(eq(businesses.id, seeded.id));
    expect(stored.name).toBe("Yaba Prints Ltd");
  });

  it("refuses with no manage token, and changes nothing", async () => {
    const seeded = await seed();
    const { status, body } = await readJson(await patch(seeded.slug, VALID));
    expect(status).toBe(401);
    expect((body.error as { code: string }).code).toBe("MANAGE_TOKEN_REQUIRED");

    const [stored] = await db.select().from(businesses).where(eq(businesses.id, seeded.id));
    expect(stored.name).toBe("Yaba Prints");
  });

  it("refuses another supplier's valid token", async () => {
    const mine = await seed();
    const theirs = await createBusiness(
      db,
      businessInput({ businessName: "Other Prints", contactChannelValue: "+2347000000000" }),
    );

    const res = await patch(theirs.slug, VALID, { "x-manage-token": mine.manageToken });
    expect(res.status).toBe(401);

    const [stored] = await db.select().from(businesses).where(eq(businesses.id, theirs.id));
    expect(stored.name).toBe("Other Prints");
  });

  it("rejects invalid data with field-level messages", async () => {
    const seeded = await seed();
    const { status, body } = await readJson(
      await patch(
        seeded.slug,
        { ...VALID, businessName: "x" },
        { "x-manage-token": seeded.manageToken },
      ),
    );
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_BODY");
  });

  it("never echoes the manage token back in its response", async () => {
    const seeded = await seed();
    const res = await patch(seeded.slug, VALID, { "x-manage-token": seeded.manageToken });
    expect(await res.text()).not.toContain(seeded.manageToken);
  });
});
