import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";
import { applyUpstreamPatches } from "./upstreamPatches";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPSTREAM_ROOT = join(__dirname, "upstream", "conformance");

const PROBE_FILE = "strconv.luau";


test(`survey: first blocker per failing fixture`, () => {
  const fixtures = [
    "assert.luau", "bitwise.luau", "clear.luau", "closure.luau",
    "datetime.luau", "debug.luau", "ifelseexpr.luau", "iter.luau",
    "move.luau", "sort.luau", "strconv.luau", "stringinterp.luau",
    "tpack.luau", "types.luau", "utf8.luau",
    "attrib.luau", "basic.luau", "calls.luau", "classes.luau",
    "constructs.luau", "errors.luau", "literals.luau", "locals.luau",
    "math.luau", "pm.luau", "strings.luau", "tables.luau",
    "vararg.luau",
  ];
  for (const name of fixtures) {
    const src = applyUpstreamPatches(
      name,
      readFileSync(join(UPSTREAM_ROOT, name), "utf8"),
    );
    let firstError: string;
    try {
      const r = runConformanceSource(src);
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
    "datetime.luau",
    readFileSync(join(UPSTREAM_ROOT, "datetime.luau"), "utf8"),
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
          ? `runtime=...${JSON.stringify(runtimeErr.slice(-200))}`
          : r.returnedOK
            ? "ok"
            : "no-error-but-NOT-OK";
      // eslint-disable-next-line no-console
      console.log(`[lines 1-${endLine}] ${status}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[lines 1-${endLine}] THREW: ${(e as Error).message}`);
    }
  };
  tryRange(1, lines.length);
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
