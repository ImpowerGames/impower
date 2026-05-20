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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
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

      const source = readFileSync(join(UPSTREAM_ROOT, f), "utf8");
      let outcome: FileResult;
      try {
        const r = runConformanceSource(source);
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
});
