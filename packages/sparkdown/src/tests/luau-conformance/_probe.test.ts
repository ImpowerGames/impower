// One-off diagnostic — runs a single upstream conformance fixture
// and dumps the full result. Edit `PROBE_FILE` to probe a different
// fixture. NOT a real test; just a debugger entry point. The
// `bisect` test below is a scratch area for narrowing down a
// failing case to its minimum repro — edit freely; the file is
// committed but its content is intentionally throwaway.
//
// Keep `PROBE_FILE` pointed at a passing fixture so the file
// doesn't introduce noise into the full-suite run.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPSTREAM_ROOT = join(__dirname, "upstream", "conformance");

const PROBE_FILE = "tables.luau";

function probe(label: string, src: string) {
  const r = runConformanceSource(src);
  // eslint-disable-next-line no-console
  console.log(`[${label}] errors=${JSON.stringify(r.errorMessages)} output=${JSON.stringify(r.output)} returnedOK=${r.returnedOK}`);
}

test(`survey: first blocker per failing fixture`, () => {
  // Run each currently-failing upstream conformance fixture through
  // the harness, capture the first severity-1 error or runtime
  // error, and print a structured summary. Pure diagnostic — not
  // an assertion (we don't want to gate CI on the survey itself).
  const fixtures = [
    // runtime-error fixtures
    "assert.luau", "bitwise.luau", "clear.luau", "closure.luau",
    "datetime.luau", "debug.luau", "ifelseexpr.luau", "iter.luau",
    "move.luau", "sort.luau", "strconv.luau", "stringinterp.luau",
    "tpack.luau", "types.luau", "utf8.luau",
    // compile-error fixtures
    "attrib.luau", "basic.luau", "calls.luau", "classes.luau",
    "constructs.luau", "errors.luau", "literals.luau", "locals.luau",
    "math.luau", "pm.luau", "strings.luau", "tables.luau",
    "vararg.luau",
  ];
  for (const name of fixtures) {
    const src = readFileSync(join(UPSTREAM_ROOT, name), "utf8");
    let firstError: string;
    try {
      const r = runConformanceSource(src);
      // First non-runtime error is the compile-time blocker; if all
      // errors are runtime, take that. Compile errors block exec
      // entirely, so they're the "true first blocker".
      const compileErr = r.errorMessages.find(
        (e) => !e.startsWith("RUNTIME"),
      );
      firstError =
        compileErr ?? r.errorMessages[0] ?? "(ran clean — already passes?)";
    } catch (e) {
      firstError = `THROW: ${(e as Error).message}`;
    }
    // eslint-disable-next-line no-console
    console.log(`[${name}] ${firstError}`);
  }
});

test(`bisect`, () => {
  // Edit freely. Keep something passing here so the file stays green.
  probe("noop", `local x = 1`);
});

test(`probe ${PROBE_FILE}`, () => {
  const src = readFileSync(join(UPSTREAM_ROOT, PROBE_FILE), "utf8");
  const r = runConformanceSource(src);
  // eslint-disable-next-line no-console
  console.log("errors:", r.errorMessages);
  // eslint-disable-next-line no-console
  console.log("warnings:", r.warningMessages);
  // eslint-disable-next-line no-console
  console.log("output:", JSON.stringify(r.output));
  // eslint-disable-next-line no-console
  console.log("returnedOK:", r.returnedOK);
});
