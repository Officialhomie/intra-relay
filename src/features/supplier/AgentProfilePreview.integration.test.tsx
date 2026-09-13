// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { quoteRoutes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildBusinessCapabilities } from "@/features/routes/capability";
import { updatePublishedPricing } from "@/features/routes/pricing";
import {
  businessInput,
  createActiveRoute,
  FULL_CHECKLIST,
  TEST_OPERATOR,
} from "@/test-support/factories";
import { createBusiness } from "@/features/businesses/service";
import { changeRouteStatus, createRoute } from "@/features/routes/service";

import { AgentProfilePreview } from "./AgentProfilePreview";

/**
 * "How buyers find you" (M10.2C).
 *
 * These tests deliberately build a REAL capability document with
 * `buildBusinessCapabilities` — the same call `/v1/<slug>/capabilities` makes —
 * and render the merchant preview from it. That is the whole architectural
 * point: if the two ever diverge, there is no second object to diverge into.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

async function renderPreviewFor(slug: string) {
  const capabilities = await buildBusinessCapabilities(db, slug);
  if (!capabilities) throw new Error(`no capabilities for ${slug}`);
  render(
    <AgentProfilePreview
      capabilities={capabilities}
      capabilitiesHref={`/v1/${slug}/capabilities`}
    />,
  );
  return capabilities;
}

describe("what the merchant is shown", () => {
  it("shows the same business identity agents receive", async () => {
    const { business } = await createActiveRoute(db);
    const capabilities = await renderPreviewFor(business.slug);

    expect(screen.getByText(capabilities.business.name)).toBeInTheDocument();
    expect(
      screen.getByText(
        `${capabilities.business.location.city}, ${capabilities.business.location.country}`,
      ),
    ).toBeInTheDocument();
  });

  it("shows the published price exactly as the capability document words it", async () => {
    const { business } = await createActiveRoute(db);
    const capabilities = await renderPreviewFor(business.slug);

    // Not re-derived here — the document's own `pricing.summary` string.
    expect(screen.getByText(capabilities.routes[0].pricing.summary)).toBeInTheDocument();
  });

  it("reflects a price change the merchant just made", async () => {
    const { business, route } = await createActiveRoute(db);
    await updatePublishedPricing(db, route.id, {
      model: "FIXED",
      amount: 42_000,
      unit: "per 500",
    });

    const capabilities = await renderPreviewFor(business.slug);
    expect(capabilities.routes[0].pricing.summary).toContain("42,000");
    expect(screen.getByText(capabilities.routes[0].pricing.summary)).toBeInTheDocument();
    expect(screen.getByText("A set price")).toBeInTheDocument();
  });

  it("shows a newly added service", async () => {
    const { business, route } = await createActiveRoute(db);
    // A second service. `createRoute` allows only one route per category
    // template today, so this is inserted the way an operator adding a second
    // service would have to — the preview must pick it up regardless.
    const [first] = await db.select().from(quoteRoutes).where(eq(quoteRoutes.id, route.id));
    await db.insert(quoteRoutes).values({
      ...first,
      id: undefined,
      slug: "banner-printing",
      name: "Banner printing quote",
      endpoint: `/v1/${business.slug}/banner-printing/quote`,
    });

    await renderPreviewFor(business.slug);
    expect(screen.getByText("Banner printing quote")).toBeInTheDocument();
    expect(screen.getByText(first.name)).toBeInTheDocument();
  });
});

describe("live vs not-yet-live", () => {
  it("gives out the order contact only for a service agents can actually use", async () => {
    const { business } = await createActiveRoute(db);
    const capabilities = await renderPreviewFor(business.slug);

    expect(capabilities.routes[0].availability.state).toBe("AVAILABLE");
    expect(screen.getByText(/Customers can see this/i)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(capabilities.business.name.slice(0, 4), "i")),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Not given out while this service is not live/i)).toBeNull();
  });

  it("withholds the order contact while nothing is live, and says so", async () => {
    const business = await createBusiness(db, businessInput({ businessName: "Draft Prints" }));
    await createRoute(db, business.slug, {});

    const capabilities = await renderPreviewFor(business.slug);
    expect(capabilities.routes[0].availability.state).toBe("UNAVAILABLE");
    expect(capabilities.routes[0].orderContact).toBeUndefined();

    expect(screen.getByText(/Not given out while this service is not live/i)).toBeInTheDocument();
    expect(screen.getByText(/Not yet visible to customers/i)).toBeInTheDocument();
    // The merchant's actual number must not appear anywhere on the page.
    expect(screen.queryByText(/\+2348012345678/)).toBeNull();
  });

  it("stops showing a paused service as visible to customers", async () => {
    const { business, route } = await createActiveRoute(db);
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR }, FULL_CHECKLIST);

    await renderPreviewFor(business.slug);
    expect(screen.getByText(/Not shown yet/i)).toBeInTheDocument();
  });
});

describe("private information stays private", () => {
  it("never renders the manage token", async () => {
    const { business } = await createActiveRoute(db);
    await renderPreviewFor(business.slug);
    // `buildBusinessCapabilities` has no manage token in it at all — this
    // guards against someone "helpfully" widening the document later.
    const capabilities = await buildBusinessCapabilities(db, business.slug);
    expect(JSON.stringify(capabilities)).not.toContain("manageToken");
    expect(document.body.textContent).not.toContain("manageToken");
  });

  it("says plainly which things are kept private", async () => {
    const { business } = await createActiveRoute(db);
    await renderPreviewFor(business.slug);

    expect(screen.getByText(/Kept private/i)).toBeInTheDocument();
    expect(screen.getByText(/Your private manage link/i)).toBeInTheDocument();
    expect(screen.getByText(/requests received, prices sent, reply times/i)).toBeInTheDocument();
  });

  it("offers the agent profile itself, without requiring the merchant to read it", async () => {
    const { business } = await createActiveRoute(db);
    await renderPreviewFor(business.slug);

    const link = screen.getByRole("link", { name: /view agent profile/i });
    expect(link).toHaveAttribute("href", `/v1/${business.slug}/capabilities`);
  });
});
