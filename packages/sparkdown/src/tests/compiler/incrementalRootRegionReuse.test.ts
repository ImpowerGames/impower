// Root-region guard scope: which top-of-file edits keep flow reuse.
//
// Reuse is disabled for a whole compile when the root region's STRUCTURE
// changes — the ordered `include`/`run` targets and `EXTERNAL` signatures —
// because those decide which files contribute flows and which call sites
// compile to external calls, neither of which a reused flow re-derives.
//
// Everything else up there is deliberately NOT structural: front matter,
// loose top-level content, and top-level `store`/`var` declarations cannot
// alter a reused flow's bytecode (top-level flows are name-addressed in
// `namedOnlyContent`, so their internal paths don't shift, and globals are
// read through runtime lookups rather than inlined). Constants ARE inlined
// and keep their own precise guard.
//
// This pins BOTH halves. Correctness alone would pass trivially if the guard
// were re-broadened, so each case also asserts whether reuse actually
// happened — that is the property under test.
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const pick = (p: any) => ({
  compiled: p.compiled,
  diagnostics: p.diagnostics,
  pathLocationsOrder: Object.keys(p.pathLocations ?? {}),
});

function stable(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

const quiet = <T,>(fn: () => T): T => {
  const w = console.warn;
  const e = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = w;
    console.error = e;
  }
};

function configured(text: string) {
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

function script(): string {
  const L: string[] = [];
  L.push("title: Root Region");
  L.push("author: Anonymous");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < 8; s++) {
    L.push(`scene scene_${s}`);
    L.push(":");
    L.push(`  Action in room ${s} with {trust}.`);
    L.push(`-> scene_${(s + 1) % 8}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

/**
 * Apply one warm-up edit far from the top (so reuse records exist), then the
 * edit under test. Returns how many flows were reused on the edit under test
 * and whether the program matched a cold compile of the same text.
 */
function measure(find: string, replace: string) {
  let text = script();
  const incr = configured(text);
  incr.compile({ textDocument: { uri: URI } } as never);

  const warmFind = "Action in room 7";
  const warmOffset = text.indexOf(warmFind);
  incr.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [
      {
        range: {
          start: posAt(text, warmOffset),
          end: posAt(text, warmOffset + warmFind.length),
        },
        text: "Action in room 7!",
      },
    ],
  } as never);
  text =
    text.slice(0, warmOffset) +
    "Action in room 7!" +
    text.slice(warmOffset + warmFind.length);
  incr.compile({ textDocument: { uri: URI } } as never);

  const offset = text.indexOf(find);
  if (offset < 0) throw new Error(`not found: ${find}`);
  incr.updateDocument({
    textDocument: { uri: URI, version: 3 },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
  } as never);
  text = text.slice(0, offset) + replace + text.slice(offset + find.length);

  const incrProg = (incr.compile({ textDocument: { uri: URI } } as never) as any)
    .program;
  const coldProg = (
    configured(text).compile({ textDocument: { uri: URI } } as never) as any
  ).program;
  return {
    reused: ((incr as any)._reusedFlowsThisCompile?.size ?? 0) as number,
    matchesCold: stable(pick(incrProg)) === stable(pick(coldProg)),
  };
}

describe("root-region guard scope", () => {
  it("front-matter text edits keep flow reuse", () => {
    const r = quiet(() => measure("title: Root Region", "title: Root Region X"));
    expect(r.matchesCold).toBe(true);
    expect(r.reused).toBeGreaterThan(0);
  });

  it("top-level store VALUE edits keep flow reuse", () => {
    const r = quiet(() => measure("store trust = 0", "store trust = 5"));
    expect(r.matchesCold).toBe(true);
    expect(r.reused).toBeGreaterThan(0);
  });

  it("editing the FIRST scene keeps reuse of the others", () => {
    const r = quiet(() => measure("Action in room 0", "Action in room 0!"));
    expect(r.matchesCold).toBe(true);
    expect(r.reused).toBeGreaterThan(0);
  });

  it("adding an `external` declaration is structural and disables reuse", () => {
    const r = quiet(() =>
      measure("store trust = 0", "store trust = 0\nexternal beep(a)"),
    );
    expect(r.matchesCold).toBe(true);
    expect(r.reused).toBe(0);
  });
});
