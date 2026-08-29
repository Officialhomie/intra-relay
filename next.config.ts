import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This project lives inside a larger directory that contains other lockfiles.
  // Pin the tracing root so Next resolves files against this project only.
  outputFileTracingRoot: import.meta.dirname,
  // Database drivers ship native/WASM assets — load them at runtime, unbundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
