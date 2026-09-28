import { defineConfig } from "vitest/config";

// The differential run of the binary program (#692) compiles shared fixtures
// once per engine and compares them, and runs randomized incremental edits on
// the statement chunks. It is kept out of the ordinary suite so that its time
// and memory stay out of the suite's; it runs alone with
// SPARKDOWN_DIFFERENTIAL=1, for example
//   SPARKDOWN_DIFFERENTIAL=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/differential/programDifferential.test.ts
const DIFFERENTIAL = "src/tests/differential/**";
const differential = process.env["SPARKDOWN_DIFFERENTIAL"] === "1";

export default defineConfig({
  test: {
    include: differential
      ? [`${DIFFERENTIAL}/*.test.ts`]
      : ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      ...(differential ? [] : [DIFFERENTIAL]),
    ],
  },
});
