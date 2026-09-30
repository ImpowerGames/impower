import { defineConfig } from "vitest/config";

// The differential run of the binary program (#692) compiles shared fixtures
// once per engine and compares them, and runs randomized incremental edits on
// the statement chunks. It also runs the suites whose stories it runs on the
// program engine (`src/tests/engineUnderTest.ts`): the Luau conformance suite
// and the runtime tests listed below. It is kept out of the ordinary suite so
// that its time and memory stay out of the suite's; it runs alone with
// SPARKDOWN_DIFFERENTIAL=1, for example
//   SPARKDOWN_DIFFERENTIAL=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/differential/programDifferential.test.ts
const DIFFERENTIAL = "src/tests/differential/**";
const ON_PROGRAM_ENGINE = [
  "src/tests/luau-conformance/**/*.test.ts",
  "src/tests/runtime/LoopNewlinesInString.test.ts",
];
const differential = process.env["SPARKDOWN_DIFFERENTIAL"] === "1";

export default defineConfig({
  test: {
    include: differential
      ? [`${DIFFERENTIAL}/*.test.ts`, ...ON_PROGRAM_ENGINE]
      : ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      ...(differential ? [] : [DIFFERENTIAL]),
    ],
  },
});
