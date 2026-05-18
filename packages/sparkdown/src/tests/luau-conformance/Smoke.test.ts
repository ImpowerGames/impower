// Wiring check for the Luau-conformance harness — verifies that the
// preamble / external-assert / OK-epilogue pipeline runs end-to-end
// before we point it at a real ported fixture.

import { describe, expect, test } from "vitest";
import {
  runConformanceFixture,
  runConformanceSource,
} from "./conformanceTestHarness";

describe("Luau conformance harness smoke", () => {
  test("a trivially-passing fixture reports returnedOK with no failures", () => {
    const result = runConformanceFixture("smoke");
    expect(result.errorMessages).toEqual([]);
    expect(result.assertionFailures).toEqual([]);
    expect(result.returnedOK).toBe(true);
  });

  test("a failing assertion is recorded but does not halt the script", () => {
    // Two asserts: one fails, one passes after it. We expect the
    // fixture to reach the OK epilogue (returnedOK = true) AND to
    // have recorded the failure. This is the "keep going, report
    // everything" behavior the harness commits to — Luau's real
    // `assert` halts on failure, but for a porting harness it's more
    // useful to see every failed assertion in one run.
    const result = runConformanceSource(
      `harness_assert(1 == 2)
harness_assert(true)
`,
    );
    expect(result.errorMessages).toEqual([]);
    expect(result.assertionFailures).toEqual(["assertion failed"]);
    expect(result.returnedOK).toBe(true);
  });
});
