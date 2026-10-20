// Edits to the root region, above every flow: front matter, a top-level
// `store` value, the first scene, and an `external` declaration. Each is
// applied after a warm-up edit far from the top, and the incremental compile
// has to build the chunks and report the diagnostics a cold compile of the
// same text does.
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { describeRoot } from "../program/describeRoot";

const URI = "inmemory:///main.sd";

const pick = (p: any) => ({
  chunks: p.chunks ? describeRoot(p.chunks) : null,
  diagnostics: p.diagnostics,
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
 * Apply one warm-up edit far from the top, then the edit under test, and
 * return the incremental program beside a cold compile of the same text.
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
  return { incremental: stable(pick(incrProg)), cold: stable(pick(coldProg)) };
}

describe("root-region edits", () => {
  it("a front-matter text edit compiles as a cold compile does", () => {
    const r = quiet(() => measure("title: Root Region", "title: Root Region X"));
    expect(r.incremental).toBe(r.cold);
  });

  it("a top-level store VALUE edit compiles as a cold compile does", () => {
    const r = quiet(() => measure("store trust = 0", "store trust = 5"));
    expect(r.incremental).toBe(r.cold);
  });

  it("an edit to the FIRST scene compiles as a cold compile does", () => {
    const r = quiet(() => measure("Action in room 0", "Action in room 0!"));
    expect(r.incremental).toBe(r.cold);
  });

  it("adding an `external` declaration compiles as a cold compile does", () => {
    const r = quiet(() =>
      measure("store trust = 0", "store trust = 0\nexternal beep(a)"),
    );
    expect(r.incremental).toBe(r.cold);
  });
});
