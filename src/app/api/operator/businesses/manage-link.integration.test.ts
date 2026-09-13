// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { auditEvents, businesses } from "@/lib/db/schema";
import { businessInput } from "@/test-support/factories";
import { createBusiness } from "@/features/businesses/service";

import { GET as manageLinkRoute } from "./[slug]/manage-link/route";

/**
 * Operator recovery of a lost manage link (M10.2A).
 *
 * This is the one endpoint in the application that deliberately returns a live
 * credential, so its gate and its blast radius are both tested explicitly.
 */

const OPERATOR_SECRET = "operator-secret-value";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  process.env.OPERATOR_API_KEYS = `test-op:${OPERATOR_SECRET}`;
});
afterEach(async () => {
  await close();
  delete process.env.OPERATOR_API_KEYS;
});

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

function get(slug: string, headers: Record<string, string> = {}) {
  return manageLinkRoute(
    new Request(`http://localhost/api/operator/businesses/${slug}/manage-link`, { headers }),
    ctx(slug),
  );
}

async function seed() {
  const business = await createBusiness(db, businessInput({ businessName: "Yaba Prints" }));
  const [row] = await db.select().from(businesses).where(eq(businesses.id, business.id));
  return row;
}

describe("recovering a manage link", () => {
  it("returns the real link to an operator", async () => {
    const seeded = await seed();
    const res = await get(seeded.slug, { "x-operator-key": OPERATOR_SECRET });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { manageUrl: string; message: string; business: { slug: string } };
    };
    expect(body.data.manageUrl).toContain(`/supplier/${seeded.slug}?t=${seeded.manageToken}`);
    expect(body.data.business.slug).toBe(seeded.slug);
    // Ready to paste into the operator's own WhatsApp.
    expect(body.data.message).toContain(seeded.manageToken);
  });

  it("refuses a request with no operator key", async () => {
    const seeded = await seed();
    const res = await get(seeded.slug);
    expect(res.status).toBe(401);
    // The token must not leak in the failure path either.
    expect(await res.text()).not.toContain(seeded.manageToken);
  });

  it("refuses a wrong operator key", async () => {
    const seeded = await seed();
    const res = await get(seeded.slug, { "x-operator-key": "not-the-key" });
    expect(res.status).toBe(401);
  });

  it("404s an unknown business rather than hinting at what exists", async () => {
    const res = await get("no-such-business", { "x-operator-key": OPERATOR_SECRET });
    expect(res.status).toBe(404);
  });

  it("records the retrieval without writing the token into the audit trail", async () => {
    const seeded = await seed();
    await get(seeded.slug, { "x-operator-key": OPERATOR_SECRET });

    const events = await db.select().from(auditEvents).where(eq(auditEvents.businessId, seeded.id));
    const recovered = events.find((e) => e.type === "business.manage_link_recovered");
    expect(recovered).toBeDefined();
    expect(JSON.stringify(recovered!.data)).not.toContain(seeded.manageToken);
    expect(JSON.stringify(recovered!.data)).toContain("operator:test-op");
  });

  it("returns one business per call — a token never rides along in a list", async () => {
    const mine = await seed();
    await createBusiness(
      db,
      businessInput({ businessName: "Other Prints", contactChannelValue: "+2347000000000" }),
    );

    const res = await get(mine.slug, { "x-operator-key": OPERATOR_SECRET });
    const text = await res.text();
    const [other] = await db.select().from(businesses).where(eq(businesses.slug, "other-prints"));
    expect(text).not.toContain(other.manageToken);
  });
});
