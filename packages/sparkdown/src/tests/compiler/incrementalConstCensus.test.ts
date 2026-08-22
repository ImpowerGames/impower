// Declared-name census oracle for incremental ExportRuntime.
//
// Constants and globals are registered in `story.variableDeclarations`, which
// `Divert.ResolveTargetContent` consults during GENERATION. So a name that
// enters or leaves that set can change other flows' call-site codegen, and a
// reused flow (whose generation is skipped) would keep the old shape. The
// census compares the whole declared-NAME set across compiles to catch it —
// including DELETIONS, which the per-chunk scan cannot see because a deleted
// declaration appears in no chunk at all.
//
// Since #309 a constant's VALUE is no longer inlined into referencing flows —
// it is initialized once as an ordinary global — so editing a constant's
// value no longer has to invalidate anything. The last test pins that
// distinction, which is the whole point of that change.
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
const URI = "inmemory:///main.sd";
const pick = (p: any) => ({ compiled: p.compiled, diagnostics: p.diagnostics });
const stable = (v: any): string => {
  const seen = new WeakSet();
  const walk = (x: any): any => {
    if (x && typeof x === "object") {
      if (seen.has(x)) return "[C]";
      seen.add(x);
      if (Array.isArray(x)) return x.map(walk);
      const o: any = {}; for (const k of Object.keys(x).sort()) o[k] = walk(x[k]); return o;
    }
    return x;
  };
  return JSON.stringify(walk(v));
};
function posAt(t: string, off: number) {
  let line = 0, ls = 0;
  for (let i = 0; i < off; i++) if (t[i] === "\n") { line++; ls = i + 1; }
  return { line, character: off - ls };
}
function conf(text: string) {
  const c = new SparkdownCompiler();
  c.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] } as any);
  return c;
}
function base() {
  const L: string[] = [];
  L.push("const LIMIT = 5");
  L.push("");
  for (let s = 0; s < 4; s++) {
    L.push(`scene scene_${s}`);
    L.push(":");
    L.push(`  Room ${s} limit is {LIMIT}.`);
    L.push(`-> scene_${(s + 1) % 4}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}
describe("incremental constant census", () => {
  it("deleting a const does not leave inlined values in reused flows", () => {
    const w = console.warn, e = console.error;
    console.warn = () => {}; console.error = () => {};
    const log: string[] = [];
    try {
      let text = base();
      const incr = conf(text);
      incr.compile({ textDocument: { uri: URI } } as any);
      let version = 1;
      const steps = [
        { find: "Room 3 limit", replace: "Room 3 Limit" },
        { find: "Room 3 Limit", replace: "Room 3 LIMIT" },
        { find: "const LIMIT = 5\n", replace: "" },   // DELETE the const
        { find: "Room 3 LIMIT", replace: "Room 3 limit" },
      ];
      for (const [i, s] of steps.entries()) {
        const off = text.indexOf(s.find);
        expect(off, `find ${s.find}`).toBeGreaterThanOrEqual(0);
        version++;
        incr.updateDocument({ textDocument: { uri: URI, version }, contentChanges: [{ range: { start: posAt(text, off), end: posAt(text, off + s.find.length) }, text: s.replace }] } as any);
        text = text.slice(0, off) + s.replace + text.slice(off + s.find.length);
        const a = stable(pick((incr.compile({ textDocument: { uri: URI } } as any) as any).program));
        const b = stable(pick((conf(text).compile({ textDocument: { uri: URI } } as any) as any).program));
        const reused = (incr as any)._reusedFlowsThisCompile?.size ?? -1;
        const dis = (incr as any)._flowReuseDisabled;
        log.push(`step${i + 1} reused=${reused} disabled=${dis} ${a === b ? "ok" : "DIVERGED"}`);
      }
    } finally {
      console.warn = w; console.error = e;
      (console as any).warn("\n" + log.join("\n") + "\n");
    }
    expect(log.filter((l) => l.includes("DIVERGED"))).toEqual([]);
  });

  // The #309 payoff. A constant's value is initialized once rather than
  // copied into each referencing flow, so changing it cannot invalidate any
  // other flow's bytecode and must NOT cost reuse. Its NAME still enters the
  // census (constants live in `variableDeclarations`, which generation reads
  // when resolving call targets), so removing one still does.
  it("editing a const's VALUE keeps reuse; removing the const does not", () => {
    const w = console.warn, e = console.error;
    console.warn = () => {}; console.error = () => {};
    const seen: { reused: number; matches: boolean }[] = [];
    try {
      let text = base();
      const incr = conf(text);
      incr.compile({ textDocument: { uri: URI } } as any);
      let version = 1;
      const steps = [
        { find: "Room 3 limit", replace: "Room 3 Limit" }, // warm up reuse
        { find: "const LIMIT = 5", replace: "const LIMIT = 6" }, // VALUE edit
        { find: "const LIMIT = 6\n", replace: "" }, // removal
      ];
      for (const s of steps) {
        const off = text.indexOf(s.find);
        expect(off, `find ${s.find}`).toBeGreaterThanOrEqual(0);
        version++;
        incr.updateDocument({ textDocument: { uri: URI, version }, contentChanges: [{ range: { start: posAt(text, off), end: posAt(text, off + s.find.length) }, text: s.replace }] } as any);
        text = text.slice(0, off) + s.replace + text.slice(off + s.find.length);
        const a = stable(pick((incr.compile({ textDocument: { uri: URI } } as any) as any).program));
        const b = stable(pick((conf(text).compile({ textDocument: { uri: URI } } as any) as any).program));
        seen.push({
          reused: (incr as any)._reusedFlowsThisCompile?.size ?? -1,
          matches: a === b,
        });
      }
    } finally {
      console.warn = w; console.error = e;
    }
    // Every step must still match a cold compile.
    expect(seen.map((s) => s.matches)).toEqual([true, true, true]);
    // Editing the value keeps flows reused (this is what #309 bought)...
    expect(seen[1]!.reused).toBeGreaterThan(0);
    // ...while removing the declaration still invalidates via the census.
    expect(seen[2]!.reused).toBe(0);
  });
});

describe("incremental global-name census", () => {
  it("a global shadowing a flow name does not leave stale call codegen", () => {
    const w = console.warn, e = console.error;
    console.warn = () => {}; console.error = () => {};
    const log: string[] = [];
    try {
      // `addup` is variadic, so a knot-call emits PackTuple while a
      // variable-target call does not. Declaring a global named `addup`
      // shadows the flow at GENERATION time (Divert.ResolveTargetContent
      // consults story.variableDeclarations), flipping every call site.
      const L: string[] = [];
      L.push("title: Shadow");
      L.push("store anchor = 1");
      L.push("");
      L.push("function addup(a, ...):");
      L.push("  return a");
      L.push("");
      for (let i = 0; i < 6; i++) {
        L.push(`scene scene_${i}`);
        L.push(":");
        L.push(`  Room ${i}.`);
        L.push(`& local r${i} = addup(1, 2, 3)`);
        L.push(`-> scene_${(i + 1) % 6}`);
        L.push("end");
        L.push("");
      }
      let text = L.join("\n");
      const incr = conf(text);
      incr.compile({ textDocument: { uri: URI } } as any);
      let version = 1;
      const SHADOW = "store anchor = 1\nstore addup = 0";
      const steps = [
        { find: "Room 5.", replace: "Room 5!" },
        // Shadow the function with a global of the same name...
        { find: "store anchor = 1", replace: SHADOW },
        // ...then remove it again: the program is valid, but any flow
        // regenerated while shadowed must not keep variable-target codegen.
        { find: SHADOW, replace: "store anchor = 1" },
        { find: "Room 4.", replace: "Room 4!" },
      ];
      for (const [i, s] of steps.entries()) {
        const off = text.indexOf(s.find);
        expect(off, `find ${s.find}`).toBeGreaterThanOrEqual(0);
        version++;
        incr.updateDocument({ textDocument: { uri: URI, version }, contentChanges: [{ range: { start: posAt(text, off), end: posAt(text, off + s.find.length) }, text: s.replace }] } as any);
        text = text.slice(0, off) + s.replace + text.slice(off + s.find.length);
        const a = stable(pick((incr.compile({ textDocument: { uri: URI } } as any) as any).program));
        const b = stable(pick((conf(text).compile({ textDocument: { uri: URI } } as any) as any).program));
        log.push(`step${i + 1} ${a === b ? "ok" : "DIVERGED"}`);
      }
    } finally {
      console.warn = w; console.error = e;
    }
    expect(log.filter((l) => l.includes("DIVERGED"))).toEqual([]);
  });
});
