// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { businesses } from "@/lib/db/schema";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import { manageLinkPath, manageLinkUrl } from "@/features/businesses/manage-link";
import { updateBusinessProfile } from "@/features/businesses/profile";

import { buildTallyPayload, DEFAULT_FORM_ID } from "./__fixtures__/tally-payload";
import { listOnboardingSubmissionsWithBusiness } from "./repository";
import { processTallySubmission } from "./service";

/**
 * The M10.1 → M10.2 seam (M10.2D).
 *
 * A merchant who onboards through Tally never touches an Intra screen, so the
 * question these tests answer is: once the webhook has run, can that merchant
 * actually be given a way in — and does it work when they use it?
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const process = (payload: ReturnType<typeof buildTallyPayload>) =>
  processTallySubmission(db, payload, DEFAULT_FORM_ID);

async function onboard(businessName: string) {
  const result = await process(buildTallyPayload({ businessName }));
  expect(result.status).toBe("PROCESSED");
  const [row] = await db.select().from(businesses).where(eq(businesses.id, result.business!.id));
  return row;
}

describe("a Tally-onboarded merchant's way in", () => {
  it("gets a usable manage token the moment the business is created", async () => {
    const business = await onboard("Tally Prints");

    expect(business.manageToken).toBeTruthy();
    expect(business.manageToken.length).toBeGreaterThanOrEqual(16);
    expect(await manageTokenMatchesBusinessSlug(db, business.slug, business.manageToken)).toBe(
      true,
    );
  });

  it("produces the same manage-link shape as every other onboarding path", async () => {
    const business = await onboard("Tally Prints");
    expect(manageLinkPath(business.slug, business.manageToken)).toBe(
      `/supplier/${business.slug}?t=${business.manageToken}`,
    );
    expect(manageLinkUrl(business.slug, business.manageToken)).toContain(
      `/supplier/${business.slug}?t=`,
    );
  });

  it("can immediately use that link to correct its own details", async () => {
    const business = await onboard("Tally Prints");

    // The whole lifecycle in one line: onboarded remotely, then self-served.
    const result = await updateBusinessProfile(db, business.slug, business.manageToken, {
      businessName: "Tally Prints Lagos",
      contactName: "Ada Obi",
      contactChannelValue: "+2348011112222",
      city: "Lagos",
    });

    expect(result.business.name).toBe("Tally Prints Lagos");
    const [stored] = await db.select().from(businesses).where(eq(businesses.id, business.id));
    expect(stored.name).toBe("Tally Prints Lagos");
    // Correcting details must never invalidate the link they just used.
    expect(stored.manageToken).toBe(business.manageToken);
    expect(stored.slug).toBe(business.slug);
  });
});

describe("what an operator can see in order to hand the link over", () => {
  it("lists the business identity for a processed submission", async () => {
    const business = await onboard("Tally Prints");
    const rows = await listOnboardingSubmissionsWithBusiness(db);

    expect(rows).toHaveLength(1);
    expect(rows[0].business).toEqual({ slug: business.slug, name: business.name });
  });

  it("never carries a manage token in the list itself", async () => {
    const business = await onboard("Tally Prints");
    const rows = await listOnboardingSubmissionsWithBusiness(db);
    expect(JSON.stringify(rows)).not.toContain(business.manageToken);
  });

  it("has no business to name for a submission that needed review", async () => {
    const result = await process(buildTallyPayload({ businessName: null }));
    expect(result.status).toBe("NEEDS_REVIEW");

    const rows = await listOnboardingSubmissionsWithBusiness(db);
    expect(rows[0].business).toBeNull();
  });
});

describe("replaying a webhook does not create a second way in", () => {
  it("keeps one business and one manage token for a redelivered submission", async () => {
    const payload = buildTallyPayload({
      businessName: "Replay Prints",
      submissionId: "sub-m10-2-replay",
    });

    const first = await process(payload);
    const second = await process(payload);
    expect(second.status).toBe("REPLAYED");
    expect(second.business!.id).toBe(first.business!.id);

    const rows = await db.select().from(businesses).where(eq(businesses.id, first.business!.id));
    expect(rows).toHaveLength(1);
    // The same credential, not a regenerated one — a link already handed over
    // must not silently stop working because Tally retried.
    expect(second.business!.manageToken).toBe(first.business!.manageToken);

    const submissions = await listOnboardingSubmissionsWithBusiness(db);
    expect(submissions).toHaveLength(1);
  });
});
