// Cumulative-path equivalence oracle: incremental == cold over MANY edits.
//
// The existing `incrementalEquivalence` oracle applies each edit from a FRESHLY
// configured compiler (single-edit reuse). This one drives many edits through
// ONE persistent compiler — the real editor HMR pattern — and after each edit
// compares the FULL emitted program (the statement chunks by content, every
// *Locations map, diagnostics, context and ui) to a cold compile of the same
// text.
//
// It pins two cumulative-only drift classes that single-edit compiles never hit:
//   1. compiler-synthesized identifiers (anonymous functions, define methods,
//      method-call temps, loop vars/labels) minted from ABSOLUTE source
//      offsets and frozen into a carried chunk, while a cold compile derives
//      the current one.
//   2. diagnostics: dedup flags left set on carried parsed nodes, so an
//      incremental compile SKIPPED warnings a cold compile emits (e.g. the
//      DivertTarget "Can't use a divert target like that" hint).
//
// The fixture ends with the constructs of `constructs()`. A fifth of the edits
// are whole edit shapes rather than random keystrokes, and the test counts,
// by chunk identity, the shaped edits that left each construct's chunk
// carried, so that it cannot pass over constructs the compile always lowered
// again.
import { describe, it, expect } from "vitest";
import { cumulativeScreenplay } from "./fixtures/coupledScreenplay";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { describeRoot } from "../program/describeRoot";

const URI = "inmemory:///main.sd";

// A string that starts each construct of the fixture's `constructs()`.
const CONSTRUCT_MARKERS: Record<string, string> = {
  "tag line": "# chapter marker",
  "tagged scene": "scene deep_choice # arc",
  "choose with a then clause": "choose\n  + [Press on]",
  "store named after an edit's define": "store thing = 1",
  "store holding a method": "store acc =",
  "function with assignments, loops and a closure": "function reckon()",
  "layout with bindings": "layout hud with",
};

// The compilation chunk each construct still present in `text` starts in.
function constructChunks(c: SparkdownCompiler, text: string) {
  const ranges: { from: number; to: number; chunk: object }[] = [];
  const cur = c.documents.annotations(URI).compilations.iter();
  while (cur.value) {
    ranges.push({ from: cur.from, to: cur.to, chunk: cur.value.type });
    cur.next();
  }
  const out = new Map<string, object>();
  for (const [construct, marker] of Object.entries(CONSTRUCT_MARKERS)) {
    const at = text.indexOf(marker);
    const found = at < 0 ? undefined : ranges.find((r) => r.from <= at && at < r.to);
    if (found) out.set(construct, found.chunk);
  }
  return { out, all: new Set(ranges.map((r) => r.chunk)) };
}

// Edit shapes applied whole, each a pair of texts the edit toggles between:
// a function or a define inserted at the top of the file (#912's carried
// chunk shape, #935, #936), a change to a parameter list (#841), and a
// rename of a callee. A pair neither of whose texts the random edits have
// left intact is skipped.
const SHAPED_EDITS: [string, string][] = [
  ["store trust = 0", "function later()\n  return 7\nend\n\nstore trust = 0"],
  [
    "define hero as character with",
    "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\ndefine hero as character with",
  ],
  ["function bonus(x):", "function bonus(x, y):"],
  ["function bonus(", "function bonus_b("],
];

// Per-field stable stringify (sorted keys; arrays kept in order). Each program
// field is compared independently so a failure names the diverging field.
const FIELDS = [
  "functionLocations",
  "sceneLocations",
  "knotLocations",
  "branchLocations",
  "labelLocations",
  "context",
  "diagnostics",
  "ui",
] as const;

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

function fieldSig(program: any): Record<string, string> {
  const sig: Record<string, string> = {};
  sig["chunks"] = JSON.stringify(program.chunks ? describeRoot(program.chunks) : null);
  for (const f of FIELDS) sig[f] = stable(program[f]);
  return sig;
}

function coldProgram(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return c.compile({ textDocument: { uri: URI } }).program;
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

describe("compiler cumulative incremental equivalence", () => {
  it("incremental == cold (full program) across many cumulative edits on ONE compiler", () => {
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      let text = cumulativeScreenplay();
      const incr = new SparkdownCompiler();
      incr.configure({
        files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
      });
      incr.compile({ textDocument: { uri: URI } });

      // Deterministic LCG (no Math.random) so the fuzz is reproducible.
      let seed = 0x51ed5;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      // "& f = function() ... end" makes an anonymous function, so the fuzz
      // creates and destroys generated names — without it, drift class 1
      // goes untested.
      //
      // The last six write pieces of the fixture's constructs: a `then`, a
      // method call, a compound assignment, a binding, a closure and a
      // `define` header. The header takes a name of its own on each edit,
      // because a name declared twice stops the cold compile resolving the
      // rest of the script (#979).
      const DEFINE_HEADER = "\ndefine header with\n";
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", DEFINE_HEADER];

      let version = 1;
      const failures: string[] = [];
      // How many shaped edits left each construct's chunk carried.
      const carried = new Map<string, number>();
      const EDITS = 200;
      for (let n = 0; n < EDITS; n++) {
        let insert = inserts[Math.floor(rand() * inserts.length)]!;
        if (insert === DEFINE_HEADER) insert = `\ndefine header_${n} with\n`;
        let delLen = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 10), 16) : 0;
        let offset = Math.floor(rand() * text.length);
        let shaped = false;
        if (rand() < 0.2) {
          const [a, b] = SHAPED_EDITS[Math.floor(rand() * SHAPED_EDITS.length)]!;
          const [find, replace] = text.includes(b) ? [b, a] : [a, b];
          if (!text.includes(find)) continue;
          offset = text.indexOf(find);
          delLen = find.length;
          insert = replace;
          shaped = true;
        }
        if (insert === "" && delLen === 0) continue;
        const before = shaped ? constructChunks(incr, text) : undefined;
        const start = posAt(text, offset);
        const end = posAt(text, Math.min(offset + delLen, text.length));
        version += 1;
        incr.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [{ range: { start, end }, text: insert }],
        });
        text = text.slice(0, offset) + insert + text.slice(offset + delLen);
        const incrSig = fieldSig(incr.compile({ textDocument: { uri: URI } }).program);
        if (before) {
          const now = constructChunks(incr, text).all;
          for (const [construct, chunk] of before.out) {
            if (now.has(chunk)) carried.set(construct, (carried.get(construct) ?? 0) + 1);
          }
        }
        const coldSig = fieldSig(coldProgram(text));
        const diverged = Object.keys(incrSig).filter((f) => incrSig[f] !== coldSig[f]);
        if (diverged.length) {
          failures.push(`#${n} insert=${JSON.stringify(insert)} del=${delLen} @${offset} fields={${diverged.join(",")}}`);
        }
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      // Each construct was carried through at least one shaped edit, so the
      // comparisons above covered it outside the reparse window.
      expect(Object.keys(CONSTRUCT_MARKERS).filter((c) => !carried.get(c))).toEqual([]);
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });

  // Deleting a generated name EARLIER in the document must leave the carried
  // function after it compiled as a cold compile compiles it: the two
  // functions here are same-shaped, so the deleted one's code must not stand
  // in for the one that comes after it.
  it("a function after a deleted one compiles as a cold compile does", () => {
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      const makeDoc = (withF1: boolean): string => {
        const L: string[] = [];
        L.push("title: T");
        L.push("");
        L.push("scene intro");
        L.push("= INT. A - DAY");
        L.push(":");
        L.push("  Hello there.");
        L.push("end");
        L.push("");
        if (withF1) {
          L.push("& f1 = function() return 1 end");
          L.push("");
        }
        L.push("scene mid");
        L.push("= INT. B - DAY");
        L.push(":");
        L.push("  More action.");
        L.push("end");
        L.push("");
        L.push("& f2 = function() return 2 end");
        L.push("");
        L.push("scene outro");
        L.push("= INT. C - DAY");
        L.push(":");
        L.push("  Bye now.");
        L.push("end");
        L.push("");
        return L.join("\n");
      };
      const before = makeDoc(true);
      const incr = new SparkdownCompiler();
      incr.configure({
        files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: before, version: 1, languageId: "sparkdown" }],
      });
      incr.compile({ textDocument: { uri: URI } });

      // Delete the "& f1 = ..." line + its trailing blank line: a single edit
      // after the first flow's start, and more than one line away from f2's
      // (so f2's chunk is carried).
      const f1Line = before.split("\n").findIndex((l) => l.startsWith("& f1"));
      incr.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [
          {
            range: {
              start: { line: f1Line, character: 0 },
              end: { line: f1Line + 2, character: 0 },
            },
            text: "",
          },
        ],
      });
      const incrSig = fieldSig(incr.compile({ textDocument: { uri: URI } }).program);
      const coldSig = fieldSig(coldProgram(makeDoc(false)));
      const diverged = Object.keys(incrSig).filter((f) => incrSig[f] !== coldSig[f]);
      expect(diverged).toEqual([]);
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });
});
