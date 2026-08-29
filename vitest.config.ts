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
  },
});
