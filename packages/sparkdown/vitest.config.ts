import { defineConfig } from "vitest/config";

const probe = process.env["SPARKDOWN_PROBE"] === "1";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      ...(probe ? [] : ["src/tests/luau-conformance/_probe.test.ts"]),
    ],
  },
});
