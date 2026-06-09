import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// `error(msg)` stdlib now consults `story.errorMessageFormatter` —
// an opt-in hook for hosts that want to inject the Luau-spec
// `<source>:<line>: ` prefix into the message. Production hosts
// (the LSP) leave the formatter unset since they surface source/line
// through their own diagnostic UI; the conformance test harness
// installs a formatter that:
//   1. Looks up the current pointer's path in
//      `program.pathLocations` (since debug metadata is stripped
//      by JSON serialization).
//   2. Subtracts the preamble line count to translate
//      wrapped-source lines back to user-fixture lines.
//   3. Prepends `<fixtureName>:<userLine>: ` to the raw message.
//
// This lets Luau-spec fixtures like basic.luau line 39 — which
// expects `pcall(function() error("oops") end)` to return
// `(false, "basic.luau:39: oops")` — check the format precisely.

describe("error message format (test-suite prefix)", () => {
  test("error() message includes fixture-name prefix", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      // Pattern-match: prefix is `<fixture>:<digits>: <msg>`. Line
      // number is approximate (compiler's coarse mapping points at
      // the enclosing function, not the precise statement) — see
      // the harness comment for details.
      `assert(err:find("basic.luau:%d+: oops") ~= nil, "got " .. tostring(err))`,
      undefined,
      "basic.luau",
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("default fixture name is 'main'", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      `assert(err:find("main:%d+: oops") ~= nil, "got " .. tostring(err))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(...)) produces full Luau-format output", () => {
    // Mirrors basic.luau lines 36-39 — the standard pcall+concat
    // pattern. Without the formatter, `concat(pcall(...))` would
    // produce `false,oops`; with it, the message includes the
    // file:line prefix.
    const r = runConformanceSource(
      `function concat(head, ...) if select('#', ...) == 0 then return tostring(head) else return tostring(head) .. "," .. concat(...) end end\n` +
      `local s = concat(pcall(function() error("oops") end))\n` +
      `assert(s:find("false,basic.luau:%d+: oops") ~= nil, "got " .. s)`,
      undefined,
      "basic.luau",
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: empty source preserves prefix safety (no crash)", () => {
    // Sanity: an error() at top-level (not inside pcall) propagates
    // as a runtime error with the prefix injected — verifies the
    // formatter doesn't crash for non-pcall paths.
    const r = runConformanceSource(`error("oops")`, undefined, "smoke.sd");
    expect(
      r.errorMessages.some(
        (e) => e.includes("smoke.sd:") && e.includes("oops"),
      ),
    ).toBe(true);
  });
});
