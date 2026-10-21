// Integration tests (Vitest) against a disposable MongoDB replica set started by mongodb-memory-server
// in replica-set mode (domain-rules §12: test infrastructure only; the application never uses it).
// Never the development or production database: MONGODB_URI is ignored here.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
