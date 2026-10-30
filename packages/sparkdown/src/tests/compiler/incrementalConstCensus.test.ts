import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programContent } from "../programListing";
const URI = "inmemory:///main.sd";
const pick = (p: any) => ({ chunks: programContent(p.chunks), diagnostics: p.diagnostics });
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
        { find: "const LIMIT = 5\n", replace: "" },
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
        { find: "Room 3 limit", replace: "Room 3 Limit" },
        { find: "const LIMIT = 5", replace: "const LIMIT = 6" },
        { find: "const LIMIT = 6\n", replace: "" },
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
    expect(seen.map((s) => s.matches)).toEqual([true, true, true]);
    expect(seen[1]!.reused).toBeGreaterThan(0);
    expect(seen[2]!.reused).toBe(0);
  });
});

describe("incremental global-name census", () => {
  it("a global shadowing a flow name does not leave stale call codegen", () => {
    const w = console.warn, e = console.error;
    console.warn = () => {}; console.error = () => {};
    const log: string[] = [];
    try {
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
        { find: "store anchor = 1", replace: SHADOW },
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
