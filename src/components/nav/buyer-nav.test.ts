import { describe, expect, it } from "vitest";

import { BUYER_NAV_ITEMS, isBuyerRoute } from "./buyer-nav";

describe("isBuyerRoute", () => {
  it("matches the three buyer destinations and any task detail page", () => {
    expect(isBuyerRoute("/agent")).toBe(true);
    expect(isBuyerRoute("/activity")).toBe(true);
    expect(isBuyerRoute("/requests")).toBe(true);
    expect(isBuyerRoute("/tasks/abc123")).toBe(true);
  });

  it("does not match the unrelated singular /request form, or other sections", () => {
    expect(isBuyerRoute("/request")).toBe(false);
    expect(isBuyerRoute("/")).toBe(false);
    expect(isBuyerRoute("/docs")).toBe(false);
    expect(isBuyerRoute("/evidence")).toBe(false);
    expect(isBuyerRoute("/operator")).toBe(false);
    expect(isBuyerRoute("/supplier/onboard")).toBe(false);
    expect(isBuyerRoute("/supplier/campus-prints")).toBe(false);
  });
});

describe("BUYER_NAV_ITEMS active matching", () => {
  const home = BUYER_NAV_ITEMS.find((i) => i.key === "home")!;
  const activity = BUYER_NAV_ITEMS.find((i) => i.key === "activity")!;
  const requests = BUYER_NAV_ITEMS.find((i) => i.key === "requests")!;

  it("Home is active only on /agent", () => {
    expect(home.isActive("/agent")).toBe(true);
    expect(home.isActive("/requests")).toBe(false);
    expect(home.isActive("/tasks/t1")).toBe(false);
  });

  it("Activity is active only on /activity", () => {
    expect(activity.isActive("/activity")).toBe(true);
    expect(activity.isActive("/agent")).toBe(false);
  });

  it("Requests is active on /requests and on any task detail page", () => {
    expect(requests.isActive("/requests")).toBe(true);
    expect(requests.isActive("/tasks/t1")).toBe(true);
    expect(requests.isActive("/agent")).toBe(false);
  });

  it("exactly one item is active for a given buyer pathname", () => {
    for (const pathname of ["/agent", "/activity", "/requests", "/tasks/t1"]) {
      const activeCount = BUYER_NAV_ITEMS.filter((item) => item.isActive(pathname)).length;
      expect(activeCount).toBe(1);
    }
  });
});
