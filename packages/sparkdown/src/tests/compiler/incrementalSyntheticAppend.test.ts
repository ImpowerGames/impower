// Synthetic-name canonicalization vs. APPENDED content.
//
// `canonicalizeSyntheticFlowNames` skips subtrees it has previously seen to
// contain no synthetic name, keyed by node identity. Assembly can append a
// later changed chunk's content into an ALREADY-EXISTING container, so a
// stale mark could hide newly-added synthetics and leave their ordinals
// diverging from a cold compile. The memo guards against that by also
// comparing the container's content length, and this pins the behaviour:
// adding anonymous functions into existing scene bodies (including one that
// shifts every later ordinal) must stay byte-identical to a cold compile.
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const stable = (v: any): string => {
  const seen = new WeakSet();
  const walk = (x: any): any => {
    if (x && typeof x === "object") {
      if (seen.has(x)) return "[C]";
      seen.add(x);
      if (Array.isArray(x)) return x.map(walk);
      const o: any = {};
      for (const k of Object.keys(x).sort()) o[k] = walk(x[k]);
      return o;
    }
    return x;
  };
  return JSON.stringify(walk(v));
};

function posAt(t: string, off: number) {
  let line = 0;
  let ls = 0;
  for (let i = 0; i < off; i++)
    if (t[i] === "\n") {
      line++;
      ls = i + 1;
    }
  return { line, character: off - ls };
}

function conf(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return c;
}

function base() {
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

describe("canonicalization with appended content", () => {
  it("adding an anonymous fn into an existing scene body stays == cold", () => {
    const w = console.warn;
    const e = console.error;
    console.warn = () => {};
    console.error = () => {};
    const log: string[] = [];
    try {
      let text = base();
      const incr = conf(text);
      incr.compile({ textDocument: { uri: URI } } as never);
      let version = 1;
      const steps = [
        // warm: unrelated edit so subtrees get marked synth-free
        { find: "Room 5 line one.", replace: "Room 5 line ONE." },
        // now add an anonymous fn INTO scene_2's existing body
        {
          find: "  Room 2 line two.",
          replace: "  Room 2 line two.\n& local f = function(x) return x + 1 end",
        },
        // and another one earlier, to shift ordinals
        {
          find: "  Room 1 line two.",
          replace: "  Room 1 line two.\n& local g = function(y) return y + 2 end",
        },
      ];
      for (const [i, s] of steps.entries()) {
        const off = text.indexOf(s.find);
        expect(off, `find ${s.find}`).toBeGreaterThanOrEqual(0);
        version++;
        incr.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [
            {
              range: {
                start: posAt(text, off),
                end: posAt(text, off + s.find.length),
              },
              text: s.replace,
            },
          ],
        } as never);
        text = text.slice(0, off) + s.replace + text.slice(off + s.find.length);
        const a = stable(
          (incr.compile({ textDocument: { uri: URI } } as never) as any).program
            .compiled,
        );
        const b = stable(
          (conf(text).compile({ textDocument: { uri: URI } } as never) as any)
            .program.compiled,
        );
        log.push(`step${i + 1} ${a === b ? "ok" : "DIVERGED"}`);
      }
    } finally {
      console.warn = w;
      console.error = e;
      (console as any).warn("\n" + log.join("\n") + "\n");
    }
    expect(log.filter((l) => l.includes("DIVERGED"))).toEqual([]);
  });
});
