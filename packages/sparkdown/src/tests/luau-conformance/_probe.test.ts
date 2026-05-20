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

const PROBE_FILE = "exceptions.luau";

function probe(label: string, src: string) {
  const r = runConformanceSource(src);
  // eslint-disable-next-line no-console
  console.log(`[${label}] errors=${JSON.stringify(r.errorMessages)} output=${JSON.stringify(r.output)} returnedOK=${r.returnedOK}`);
}

test(`bisect`, () => {
  // Edit freely to narrow a failing fixture's minimum repro. Keep
  // pointed at something passing so this file stays green in the
  // full-suite run.
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
