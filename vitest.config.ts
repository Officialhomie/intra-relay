import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Test runner config. Independent of the Next build.
 * `@vitejs/plugin-react` provides the JSX transform for component tests.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src/", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    clearMocks: true,
    // Integration suites each spin up a fresh embedded PGlite (WASM Postgres)
    // and run migrations in beforeEach. Under full fork parallelism that
    // cold-start can exceed the default 10s hook timeout on an 8-core machine,
    // so cap parallelism and give hooks/tests room. See docs/DEVELOPMENT_WORKFLOW.md.
    pool: "forks",
    maxWorkers: 4,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
