// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forwardToAmplitude } from "./forward";
import type { ServerAnalyticsConfig } from "./config";

const ENABLED: ServerAnalyticsConfig = {
  enabled: true,
  apiKey: "server-key",
  environment: "production",
  endpoint: "https://api2.amplitude.com/2/httpapi",
};
const DISABLED: ServerAnalyticsConfig = {
  enabled: false,
  apiKey: null,
  environment: "development",
  endpoint: "https://api2.amplitude.com/2/httpapi",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("forwardToAmplitude (M9.5 §3, §19)", () => {
  it("no-ops without a server key", async () => {
    await forwardToAmplitude(
      [{ event: "request_received", userId: "b1", role: "business" }],
      DISABLED,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a well-formed HTTP V2 payload with environment stamped", async () => {
    await forwardToAmplitude(
      [
        {
          event: "attention_required",
          userId: "sess-abcdef12",
          role: "buyer",
          props: { level: "ACTION_REQUIRED" },
          insertId: "attention_required:n1",
        },
      ],
      ENABLED,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENABLED.endpoint);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.api_key).toBe("server-key");
    expect(body.events[0]).toMatchObject({
      user_id: "sess-abcdef12",
      event_type: "attention_required",
      insert_id: "attention_required:n1",
      event_properties: { environment: "production", level: "ACTION_REQUIRED" },
      user_properties: { role: "buyer", environment: "production" },
    });
  });

  it("drops events with no user id, and secrets never leave", async () => {
    await forwardToAmplitude(
      [
        { event: "request_received", userId: null, role: "business" },
        {
          event: "request_received",
          userId: "b1",
          role: "business",
          props: { manageToken: "secret", has_deadline: true },
        },
      ],
      ENABLED,
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.events).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.events[0].event_properties.has_deadline).toBe(true);
  });

  it("never throws when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(
      forwardToAmplitude([{ event: "push_sent", userId: "b1", role: "business" }], ENABLED),
    ).resolves.toBeUndefined();
  });
});
