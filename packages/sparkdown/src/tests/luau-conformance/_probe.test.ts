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
    "math.luau",
    readFileSync(join(UPSTREAM_ROOT, "math.luau"), "utf8"),
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
  const tryProbe = (label: string, src: string) => {
    try {
      const r = runConformanceSource(src);
      const compileErr = r.errorMessages.find((e) => !e.startsWith("RUNTIME"));
      const runtimeErr = r.errorMessages.find((e) => e.startsWith("RUNTIME"));
      const status = compileErr ? `compile=${JSON.stringify(compileErr.slice(0, 300))}` : runtimeErr ? `runtime=...${JSON.stringify(runtimeErr.slice(-200))}` : "ok";
      // eslint-disable-next-line no-console
      console.log(`[${label}] ${status} output=${JSON.stringify(r.output.slice(0, 200))}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[${label}] THREW: ${(e as Error).message}`);
    }
  };
  tryProbe("redeclare-vf", `local inf = math.huge
local v,e = math.frexp("1.5")
assert(v == 0.75 and e == 1)
assert(math.log("0") == -inf, "log0")
local v,f = math.modf("1.5")
assert(v == 1 and f == 0.5, "modf is " .. tostring(v) .. "," .. tostring(f))
assert(math.pow("2", 2) == 4, "pow")`);
  tryProbe("tail501", `assert(math.modf("1.5") == 1, "modf")
assert(math.pow("2", 2) == 4, "pow")
assert(math.rad("0") == 0, "rad")
assert(math.sinh("0") == 0, "sinh")
assert(math.sin("0") == 0, "sin")
assert(math.sqrt("4") == 2, "sqrt")
assert(math.tanh("0") == 0, "tanh")
assert(math.tan("0") == 0, "tan")`);
  tryProbe("frexpstr", `local v,e = math.frexp("1.5")
assert(v == 0.75, "v is " .. tostring(v))
assert(e == 1, "e is " .. tostring(e))
local v2,f2 = math.modf("1.5")
assert(v2 == 1 and f2 == 0.5, "modf")`);
  tryProbe("powstr", `assert(math.pow("2", 2) == 4, "pow")
assert(math.ldexp("0.75", 1) == 1.5, "ldexp")
assert(math.log("8", 2) == 3, "log2")
assert(math.fmod("1.5", 1) == 0.5, "fmod")
assert(math.clamp("0", 2, 3) == 2, "clamp")`);
  tryProbe("isinf", `assert(math.isinf(math.huge), "1")
assert(math.isinf(0/0) == false, "2")
assert(math.isfinite(123.45), "3")
local function noinline(x, ...) local s, r = pcall(function(y) return y end, x) return r end
assert(math.isinf(noinline(math.huge)), "4")
assert(math.isfinite(noinline(123.45)), "5")`);
  tryProbe("selecthash", `assert(select('#', math.floor(1.4)) == 1, "floor")
assert(select('#', math.modf(1.5)) == 2, "modf")
assert(select(2, math.modf(1.5)) == 0.5, "modf2")`);
  tryProbe("noise", `error(tostring(math.noise(0.5)) .. " | " .. tostring(math.noise(0.5, 0.5)) .. " | " .. tostring(math.noise(0.5, 0.5, -0.5)) .. " | " .. tostring(math.noise(455.7204209769105, 340.80410508750134, 121.80087666537628)))`);
  tryProbe("ret-then-corostatus", `do return('OK') end
assert(type(f) == "thread" and coroutine.status(f) == "suspended")`);
  tryProbe("ret-then-unknowncall", `do return('OK') end
assert(unknown.status(f) == "suspended")`);
  tryProbe("ret-then-status-only", `do return('OK') end
local q = coroutine.status(f)`);
  tryProbe("doreturn-then-code", `local x = 1
do return('OK') end
x = 2
error("should not reach")`);
  tryProbe("doreturn-then-loop", `local x = 1
do return('OK') end
for i = 1, 3 do x = x + 1 end
error("should not reach")`);
  tryProbe("topdoreturn", `local x = 1
do return('OK') end
error("should not reach")`);
  tryProbe("doreturn", `local function f()
  do return 7 end
  return 9
end
assert(f() == 7, "f is " .. tostring(f()))`);
  tryProbe("breakclosure-rebind", `function f(x) return x end
for k, v in pairs{"a", "b"} do
  f = function () return k, v end
  break
end
local r = {f()}
assert(r[1] == 1, "r1 is " .. tostring(r[1]))
assert(r[2] == "a", "r2 is " .. tostring(r[2]))`);
  tryProbe("breakclosure-tblidx", `local f
for k, v in pairs{"a", "b"} do
  f = function () return k, v end
  break
end
assert(({f()})[1] == 1, "t1")
assert(({f()})[2] == "a", "t2")`);
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
