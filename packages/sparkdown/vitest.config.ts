import { defineConfig } from "vitest/config";

const probe = process.env["SPARKDOWN_PROBE"] === "1";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      // A debugger entry point, not a test (its header says so), and its
      // 85 s survey makes no assertion. It runs alone with SPARKDOWN_PROBE=1,
      // for example
      //   SPARKDOWN_PROBE=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/luau-conformance/_probe.test.ts
      ...(probe ? [] : ["src/tests/luau-conformance/_probe.test.ts"]),
    ],
  },
});
