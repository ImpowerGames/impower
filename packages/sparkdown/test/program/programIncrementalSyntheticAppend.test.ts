import { describe, expect, it } from "vitest";
import { MAIN_URI, programCompiler } from "./programHarness";
import { coldSurface, CONFIG, divergence, type Edit, quiet, surface, update } from "./incrementalOracleHarness";

function syntheticBase() {
  const L: string[] = [];
  for (let s = 0; s < 6; s++) {
    L.push(`scene scene_${s}`);
    L.push(":");
    L.push(`  Room ${s} line one.`);
    L.push(`  Room ${s} line two.`);
    L.push(`-> scene_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

function syntheticNestedBase() {
  const L: string[] = ["store visits = 0", ""];
  for (let s = 0; s < 6; s++) {
    L.push(`scene scene_${s}`);
    L.push(`  Room ${s} line one.`);
    L.push(`  if visits < 9 then`);
    L.push(`    Room ${s} inside the if.`);
    L.push("    for i = 1, 2 do");
    L.push(`      Room ${s} loop {i}.`);
    L.push("    end");
    L.push("  end");
    L.push(`  Room ${s} line two.`);
    L.push(`  -> scene_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

describe("incrementalSyntheticAppend on the binary program", () => {
  const run = (text: string, steps: Edit[]) =>
    quiet(() => {
      expect(coldSurface(text).chunks).not.toBeNull();
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      c.compile();
      const log: string[] = [];
      steps.forEach((step, i) => {
        const offset = text.indexOf(step.find);
        expect(offset, `find ${step.find}`).toBeGreaterThanOrEqual(0);
        text = update(c.compiler, text, i + 2, offset, offset + step.find.length, step.replace);
        const program = c.compile().program;
        const detail = divergence(surface(program), coldSurface(text));
        log.push(`step ${i + 1} ${step.name}: ${program.chunks ? "chunks" : "no chunks"} ${detail ?? "ok"}`);
      });
      return log;
    });

  it("adding an anonymous fn into an existing scene body stays == cold", () => {
    const log = run(syntheticBase(), [
      { name: "warm", find: "Room 5 line one.", replace: "Room 5 line ONE." },
      { name: "append into scene_2", find: "  Room 2 line two.", replace: "  Room 2 line two.\n& local f = function(x) return x + 1 end" },
      { name: "append into scene_1", find: "  Room 1 line two.", replace: "  Room 1 line two.\n& local g = function(y) return y + 2 end" },
    ]);
    expect(log.filter((l) => !l.endsWith(" ok"))).toEqual([]);
  }, 120_000);

  it("adding anonymous fns into the bodies of nested blocks stays == cold", () => {
    const log = run(syntheticNestedBase(), [
      { name: "warm", find: "Room 5 line one.", replace: "Room 5 line ONE." },
      { name: "append into the loop of scene_2", find: "      Room 2 loop {i}.", replace: "      Room 2 loop {i}.\n      & local f = function(x) return x + 1 end" },
      { name: "append into the if of scene_1", find: "    Room 1 inside the if.", replace: "    Room 1 inside the if.\n    & local g = function(y) return y + 2 end" },
      { name: "append into the loop of scene_0", find: "      Room 0 loop {i}.", replace: "      Room 0 loop {i}.\n      local h = function(z) return z * 2 end" },
      { name: "remove the one of scene_1", find: "\n    & local g = function(y) return y + 2 end", replace: "" },
      { name: "edit the one of scene_2", find: "return x + 1", replace: "return x + 3" },
    ]);
    expect(log.filter((l) => !l.endsWith(" ok"))).toEqual([]);
  }, 120_000);
});
