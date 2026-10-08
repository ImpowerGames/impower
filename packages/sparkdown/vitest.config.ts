import { defineConfig } from "vitest/config";

// The differential run of the binary program (#692) compiles shared fixtures
// once per engine and compares them, and runs randomized incremental edits on
// the statement chunks. It is kept out of the ordinary suite so that its time
// and memory stay out of the suite's; it runs alone with
// SPARKDOWN_DIFFERENTIAL=1, for example
//   SPARKDOWN_DIFFERENTIAL=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/differential/programDifferential.test.ts
// The suites that run their stories through `src/tests/engineUnderTest.ts`
// (the Luau conformance suite and the runtime tests) run them on the program
// engine in the ordinary suite (#705).
const DIFFERENTIAL = "src/tests/differential/**";
const differential = process.env["SPARKDOWN_DIFFERENTIAL"] === "1";

const probe = process.env["SPARKDOWN_PROBE"] === "1";

export default defineConfig({
  test: {
    // Every compile builds statement chunks unless the test says otherwise
    // (#705).
    setupFiles: ["src/tests/programChunksByDefault.ts"],
    include: differential
      ? [`${DIFFERENTIAL}/*.test.ts`]
      : ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      // A debugger entry point, not a test (its header says so), and its
      // 85 s survey makes no assertion. It runs alone with SPARKDOWN_PROBE=1,
      // for example
      //   SPARKDOWN_PROBE=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/luau-conformance/_probe.test.ts
      ...(probe ? [] : ["src/tests/luau-conformance/_probe.test.ts"]),
      ...(differential ? [] : [DIFFERENTIAL]),
    ],
  },
});
