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
import { applyUpstreamPatches } from "./upstreamPatches";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPSTREAM_ROOT = join(__dirname, "upstream", "conformance");

const PROBE_FILE = "strconv.luau";

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
    // Apply read-time patches — among other things they neutralize
    // closure.luau's GC-detection loop, which would otherwise hang
    // the survey synchronously (vitest timeouts can't interrupt it).
    const src = applyUpstreamPatches(
      name,
      readFileSync(join(UPSTREAM_ROOT, name), "utf8"),
    );
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

test(`bisect-basic`, () => {
  const src = applyUpstreamPatches(
    "constructs.luau",
    readFileSync(join(UPSTREAM_ROOT, "constructs.luau"), "utf8"),
  );
  const lines = src.split("\n");
  const tryRange = (startLine: number, endLine: number) => {
    const slice = lines.slice(startLine - 1, endLine).join("\n");
    try {
      const r = runConformanceSource(slice, undefined, "basic.luau");
      const compileErr = r.errorMessages.find((e) => !e.startsWith("RUNTIME"));
      const runtimeErr = r.errorMessages.find((e) => e.startsWith("RUNTIME"));
      const status = compileErr
        ? `compile=${JSON.stringify(compileErr.slice(0, 80))}`
        : runtimeErr
          ? `runtime=${JSON.stringify(runtimeErr.slice(0, 300))}`
          : "ok";
      // eslint-disable-next-line no-console
      console.log(`[lines 1-${endLine}] ${status}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[lines 1-${endLine}] THREW: ${(e as Error).message}`);
    }
  };
  const tryProbe = (label: string, src: string) => {
    try {
      const r = runConformanceSource(src);
      const compileErr = r.errorMessages.find((e) => !e.startsWith("RUNTIME"));
      const runtimeErr = r.errorMessages.find((e) => e.startsWith("RUNTIME"));
      const status = compileErr ? `compile=${JSON.stringify(compileErr.slice(0, 300))}` : runtimeErr ? `runtime=${JSON.stringify(runtimeErr.slice(0, 300))}` : "ok";
      // eslint-disable-next-line no-console
      console.log(`[${label}] ${status} output=${JSON.stringify(r.output.slice(0, 200))}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[${label}] THREW: ${(e as Error).message}`);
    }
  };
  for (const end of [88, 102, 122, 142, 162, 182, 202, 222, 242, lines.length]) {
    process.stdout.write(`START 1-${end}
`);
    tryRange(1, end);
  }
});

test(`probe ${PROBE_FILE}`, () => {
  for (const name of [PROBE_FILE, "stringinterp.luau"]) {
    const src = applyUpstreamPatches(
      name,
      readFileSync(join(UPSTREAM_ROOT, name), "utf8"),
    );
    const r = runConformanceSource(src, undefined, name);
    // eslint-disable-next-line no-console
    console.log(`[${name}] errors:`, r.errorMessages);
    // eslint-disable-next-line no-console
    console.log(`[${name}] returnedOK:`, r.returnedOK);
  }
});
