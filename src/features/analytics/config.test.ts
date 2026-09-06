import { describe, expect, it } from "vitest";

import {
  readBrowserAnalyticsConfig,
  readServerAnalyticsConfig,
  resolveAnalyticsEnvironment,
} from "./config";

describe("resolveAnalyticsEnvironment (M9.5 §30)", () => {
  it("maps known values", () => {
    expect(resolveAnalyticsEnvironment("production")).toBe("production");
    expect(resolveAnalyticsEnvironment("prod")).toBe("production");
    expect(resolveAnalyticsEnvironment("staging")).toBe("staging");
    expect(resolveAnalyticsEnvironment("preview")).toBe("staging");
  });

  it("defaults to development for anything else", () => {
    expect(resolveAnalyticsEnvironment(undefined)).toBe("development");
    expect(resolveAnalyticsEnvironment("")).toBe("development");
    expect(resolveAnalyticsEnvironment("local")).toBe("development");
  });
});

describe("readBrowserAnalyticsConfig", () => {
  it("is disabled with no key", () => {
    const config = readBrowserAnalyticsConfig({ apiKey: null, appEnv: "production" });
    expect(config.enabled).toBe(false);
    expect(config.apiKey).toBeNull();
  });

  it("is enabled with a key and carries the environment", () => {
    const config = readBrowserAnalyticsConfig({ apiKey: "  browser-key  ", appEnv: "staging" });
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("browser-key");
    expect(config.environment).toBe("staging");
    expect(config.serverZone).toBe("US");
  });

  it("honours an EU server zone", () => {
    expect(readBrowserAnalyticsConfig({ apiKey: "k", serverZone: "eu" }).serverZone).toBe("EU");
  });
});

describe("readServerAnalyticsConfig", () => {
  const base = {} as NodeJS.ProcessEnv;

  it("is disabled with no AMPLITUDE_API_KEY", () => {
    const config = readServerAnalyticsConfig({ ...base, NEXT_PUBLIC_APP_ENV: "production" });
    expect(config.enabled).toBe(false);
    expect(config.apiKey).toBeNull();
    expect(config.environment).toBe("production");
    expect(config.endpoint).toContain("api2.amplitude.com");
  });

  it("is enabled independently of the browser key", () => {
    const config = readServerAnalyticsConfig({ ...base, AMPLITUDE_API_KEY: "server-key" });
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("server-key");
  });

  it("uses the EU endpoint when AMPLITUDE_SERVER_ZONE=EU", () => {
    const config = readServerAnalyticsConfig({
      ...base,
      AMPLITUDE_API_KEY: "k",
      AMPLITUDE_SERVER_ZONE: "EU",
    });
    expect(config.endpoint).toContain("api.eu.amplitude.com");
  });
});
