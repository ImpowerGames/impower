// First ported Luau conformance fixture: `basic.luau` from
// (https://github.com/luau-lang/luau/blob/master/tests/conformance/basic.luau,
// MIT). The local copy at `fixtures/basic.sd` is a verbatim copy of
// the upstream — sparkdown aspires to be a Luau superset, so any
// upstream assertion that doesn't pass against our compiler+runtime
// is a real gap.
//
// These tests are marked `test.skip` until native Luau stdlib
// functions land (`assert`, `tostring`, `error`, `pcall`, etc. — see
// STDLIB.md). Without those, even a parser-clean fixture can't run
// because upstream uses bare `assert(...)` calls that don't yet
// resolve to anything in sparkdown's runtime. Re-enable once the
// stdlib work is far enough along.

import { describe, expect, test } from "vitest";
import { runConformanceFixture } from "./conformanceTestHarness";

describe("Luau conformance — basic.luau (ported)", () => {
  test.skip("compiles without errors", () => {
    const result = runConformanceFixture("basic");
    expect(result.errorMessages).toEqual([]);
  });

  test.skip("all ported assertions pass and reach the OK marker", () => {
    const result = runConformanceFixture("basic");
    expect(result.assertionFailures).toEqual([]);
    expect(result.returnedOK).toBe(true);
  });
});
