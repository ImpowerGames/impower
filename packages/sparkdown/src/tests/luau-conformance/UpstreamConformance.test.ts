// Iterates the vendored upstream Luau conformance suite
// (`upstream/conformance/*.luau`, committed under upstream/) and
// reports a baseline of pass / compile-fail / runtime-fail.
//
// Each file is fed verbatim to `runConformanceSource` — sparkdown
// is a Luau superset, so `.luau` source compiles and runs as-is
// once wrapped in the harness's `function run() ... end`. Failures
// fall into:
//
//   - compile-error: parser/lowerer can't accept the syntax yet
//   - runtime-error: story.Error thrown during execution (typically
//     a failed `assert(...)` or an unimplemented stdlib)
//   - did-not-reach-OK: reached end of script but the OK marker
//     wasn't emitted (shouldn't happen unless flow diverted away)
//
// The test produces a SUMMARY console log at the end with per-file
// status. Don't gate CI on individual file results — this is a
// calibration / regression-tracking harness, not a green/red bar.
// The aggregate "X% of files reach OK" is what we watch over time.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { applyUpstreamPatches } from "./upstreamPatches";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPSTREAM_ROOT = join(__dirname, "upstream", "conformance");

// Files we know up-front depend on infrastructure we don't have
// (metatables, coroutines, buffers, vectors, native codegen). Skip
// them — they're not interesting failures, just confirmation that
// they need their respective infra to land.
const SKIP_FILES = new Set([
  "buffers.luau",
  "coroutine.luau",
  "cyield.luau",
  "events.luau", // metatables
  "tmerror.luau", // metatable error
  "vector.luau",
  "vector_library.luau",
  "userdata.luau",
  "udata_direct.luau",
  "native.luau",
  "native_integer_spills.luau",
  "native_integer_regspill.luau",
  "native_types.luau",
  "native_userdata.luau",
  "ndebug_upvalues.luau",
  "integers.luau", // Luau's native 64-bit int type
  "integers_regspill.luau",
  "apicalls.luau",
  "debugger.luau",
  "coverage.luau",
  "gc.luau",
  "safeenv.luau",
  "iter_fenv.luau", // getfenv
  "interrupt.luau",
  "explicit_type_instantiations.luau", // type system
  "pcall.luau", // heavily coroutine-dependent (uses coroutine.yield + resumeerror)
  // debug.luau exercises debug.traceback / debug.info with REAL
  // call-stack introspection, threaded through coroutines from line
  // 10 onward (`coroutine.create(bar)` + tracebacks of suspended
  // coroutines). Coroutines are skip-class infra (see pcall.luau).
  "debug.luau",
  // locals.luau heavily uses `loadstring` / `getfenv` / `setfenv` —
  // Lua 5.1-only features removed in Luau itself. It also trips a
  // grammar quirk: multi-line `[[...]]` raw strings containing `%s`
  // produce "Invalid syntax" when preceded by certain prior content
  // (a stray `end` is enough in isolation). Reproduces as:
  //   end
  //   for i=2,31 do assert(loadstring(string.format([[a=%s
  //   ]], 1))) end
  // The "Invalid syntax" diagnostic is from the textmate grammar,
  // not the lowerer. Worth a focused investigation of `LuauMultilineString`
  // vs surrounding-context interaction, but the fixture itself is
  // mostly untestable under Luau either way.
  "locals.luau",
  // classes.luau exercises a `class Name ... end` syntax that isn't
  // in production Luau — it's a proposed/RFC feature being prototyped
  // in upstream's conformance suite (file starts with `--!nocheck`
  // since the typechecker can't validate it either). Sparkdown
  // intentionally takes a different OOP path: `define Name with ...
  // end` (see `project_define_is_class_sugar.md`), which desugars to
  // class-like behaviour via the existing struct/inheritance
  // machinery. We'd implement OOP-conformance fixtures against
  // `define` if we wrote them; the upstream `class`-syntax fixture
  // doesn't apply.
  "classes.luau",
  // types.luau cross-checks the VM's globals against `RTTI` — a
  // global injected by Luau's C++ test executable (the fixture's own
  // ignore list notes it's "only exposed in tests"). It also walks
  // `getmetatable(_G).__index`. Neither exists outside that harness;
  // the fixture isn't testable in sparkdown.
  "types.luau",
  // literals.luau is a SCANNER test — it exercises the lexer by
  // compiling source strings at runtime (13 `loadstring`/`dostring`
  // sites: escape handling, long-string level counting, number
  // formats). Sparkdown stories are precompiled with no runtime
  // compiler, so the fixture is untestable here — same reasoning as
  // locals.luau.
  "literals.luau",
  // errors.luau checks compiler/VM error MESSAGES by compiling
  // error-producing chunks at runtime — every assertion routes
  // through `doit` (= loadstring + pcall), `checkmessage`,
  // `checksyntax`, or `lineerror`. Upstream itself already stubbed
  // out checkmessage's body (Luau messages diverge from Lua's).
  // Untestable without a runtime compiler.
  "errors.luau",
]);

type FileResult = {
  name: string;
  status: "ok" | "compile-error" | "runtime-error" | "did-not-reach-ok" | "skipped";
  errorMessages: string[];
  warningMessages: string[];
};

describe("Luau upstream conformance baseline", () => {
  test("report baseline pass/fail across upstream conformance suite", () => {
    if (!existsSync(UPSTREAM_ROOT)) {
      // eslint-disable-next-line no-console
      console.log(
        "[upstream-conformance] upstream/conformance/ not present; re-vendor per upstream/VENDORING.md to enable this baseline. Skipping.",
      );
      return;
    }

    const files = readdirSync(UPSTREAM_ROOT)
      .filter((f) => f.endsWith(".luau"))
      .sort();

    const results: FileResult[] = [];
    for (const f of files) {
      if (SKIP_FILES.has(f)) {
        results.push({
          name: f,
          status: "skipped",
          errorMessages: [],
          warningMessages: [],
        });
        continue;
      }

      // Patched at read time for documented spec-vs-implementation
      // divergences (pairs iteration order) — see upstreamPatches.ts.
      const source = applyUpstreamPatches(
        f,
        readFileSync(join(UPSTREAM_ROOT, f), "utf8"),
      );
      let outcome: FileResult;
      try {
        // Pass the fixture filename so the harness's
        // `errorMessageFormatter` can build Luau-spec error prefixes
        // like `basic.luau:39: oops`.
        const r = runConformanceSource(source, undefined, f);
        let status: FileResult["status"];
        if (r.errorMessages.length > 0) {
          // Classify by the FIRST message — primary cause. `AddError`
          // prepends "RUNTIME ERROR" / "RUNTIME WARNING" to anything
          // thrown at runtime (failed assert, unimplemented stdlib,
          // etc.). Anything else is a compile-time diagnostic from
          // the lowerer / parser. A "[harness threw]" prefix also
          // counts as runtime — the JS exception came from execution.
          const first = r.errorMessages[0]!;
          status =
            /^RUNTIME (ERROR|WARNING)/.test(first) ||
            first.startsWith("[harness threw]")
              ? "runtime-error"
              : "compile-error";
        } else if (!r.returnedOK) {
          status = "did-not-reach-ok";
        } else {
          status = "ok";
        }
        outcome = {
          name: f,
          status,
          errorMessages: r.errorMessages,
          warningMessages: r.warningMessages,
        };
      } catch (e) {
        // Unhandled JS exception — bisect this case eventually.
        outcome = {
          name: f,
          status: "runtime-error",
          errorMessages: [
            `[harness threw] ${(e as Error)?.message ?? String(e)}`,
          ],
          warningMessages: [],
        };
      }
      results.push(outcome);
    }

    // Aggregate + report.
    const tally = {
      ok: 0,
      "compile-error": 0,
      "runtime-error": 0,
      "did-not-reach-ok": 0,
      skipped: 0,
    };
    for (const r of results) tally[r.status]++;

    const lines: string[] = [];
    lines.push("=== Luau upstream conformance baseline ===");
    lines.push(`total fixtures: ${results.length}`);
    lines.push(`  ok:               ${tally.ok}`);
    lines.push(`  compile-error:    ${tally["compile-error"]}`);
    lines.push(`  runtime-error:    ${tally["runtime-error"]}`);
    lines.push(`  did-not-reach-ok: ${tally["did-not-reach-ok"]}`);
    lines.push(`  skipped:          ${tally.skipped}`);
    lines.push("");
    lines.push("Per-file detail (first 200 chars of each failure):");
    for (const r of results) {
      if (r.status === "ok" || r.status === "skipped") {
        lines.push(`  [${r.status.padEnd(8)}] ${r.name}`);
        continue;
      }
      lines.push(`  [${r.status.padEnd(8)}] ${r.name}`);
      const sample = r.errorMessages[0] ?? "(no message)";
      lines.push(`    ${sample.slice(0, 200)}`);
    }

    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
  });

  // Fixtures that fully pass are GATED — unlike the calibration
  // report above, a regression here is a hard failure. basic.luau
  // (1018 lines of language/library fundamentals) reached end-to-end
  // OK on 2026-06-12; strconv.luau and stringinterp.luau followed
  // the same day. Add fixtures here as they go green.
  const PASSING_FIXTURES = [
    "assert.luau",
    "attrib.luau",
    "basic.luau",
    "bitwise.luau",
    "calls.luau",
    "clear.luau",
    "closure.luau",
    "constructs.luau",
    "ifelseexpr.luau",
    "iter.luau",
    "math.luau",
    "move.luau",
    "pm.luau",
    "sort.luau",
    "strconv.luau",
    "stringinterp.luau",
    "strings.luau",
    "tables.luau",
    "tpack.luau",
    "vararg.luau",
  ];
  for (const fixture of PASSING_FIXTURES) {
    test(
      `${fixture} passes end-to-end`,
      () => {
        if (!existsSync(UPSTREAM_ROOT)) return;
        const source = applyUpstreamPatches(
          fixture,
          readFileSync(join(UPSTREAM_ROOT, fixture), "utf8"),
        );
        const r = runConformanceSource(source, undefined, fixture);
        expect(r.errorMessages).toEqual([]);
        expect(r.returnedOK).toBe(true);
      },
      300000,
    );
  }
});
