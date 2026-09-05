// Cumulative-path equivalence oracle: incremental == cold over MANY edits.
//
// The existing `incrementalEquivalence` oracle applies each edit from a FRESHLY
// configured compiler (single-edit reuse). This one drives many edits through
// ONE persistent compiler — the real editor HMR pattern — and after each edit
// compares the FULL emitted program (compiled bytecode + every *Locations map +
// diagnostics + context + ui) to a cold compile of the same text.
//
// It pins two cumulative-only drift classes that single-edit reuse never hit:
//   1. compiled (bytecode): compiler-synthesized identifiers (`__anon_fn_<from>`,
//      `__define_fn_<from>`, `__mcall_<from>`, loop vars/labels) were minted from
//      ABSOLUTE source offsets and frozen into per-chunk lowered IR the pipeline
//      reuses-and-shifts without re-lowering — so a carried chunk kept a stale
//      offset while a cold compile re-derived the current one. Fixed by
//      `SparkdownCompiler.canonicalizeSyntheticFlowNames` (renumber by document
//      order). Was ~25/400 edits divergent.
//   2. diagnostics: `ExportRuntime` sets `_alreadyHad{Error,Warning}` dedup flags
//      on parsed nodes; reused nodes kept them set, so an incremental compile
//      SKIPPED warnings a cold compile emits (e.g. the DivertTarget "Can't use a
//      divert target like that" hint). Fixed by `resetParsedRuntimeState`. Was
//      ~185/400 edits divergent.
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

function coupledScreenplay(): string {
  const L: string[] = [];
  L.push("title: Incr Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("");
  L.push("store trust = 0");
  L.push("store visited_count = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  const SC = 14;
  for (let s = 0; s < SC; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in some detail here.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Second line with {trust} and read-count {scene_${(s + 1) % SC}} here.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    L.push(`-> scene_${(s + 3) % SC}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

// Per-field stable stringify (sorted keys; arrays kept in order). Each program
// field is compared independently so a failure names the diverging field.
const FIELDS = [
  "compiled",
  "pathLocations",
  "dataLocations",
  "functionLocations",
  "sceneLocations",
  "knotLocations",
  "stitchLocations",
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
  for (const f of FIELDS) sig[f] = stable(program[f]);
  // Emission ORDER of pathLocations/dataLocations matters (Game.ts iterates it)
  // and stable() sorts keys, so capture order explicitly.
  sig["pathLocationsOrder"] = JSON.stringify(
    Object.keys(program.pathLocations ?? {}),
  );
  sig["dataLocationsOrder"] = JSON.stringify(Object.keys(program.dataLocations ?? {}));
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
      let text = coupledScreenplay();
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
      // "& f = function() ... end" mints an anonymous-function knot (a
      // synthetic `__synth_<n>` top-level flow), so the fuzz exercises
      // synthetic-name renumbering + the name-keyed flow caches — without it,
      // no edit ever creates or destroys a synthetic name and drift class 1
      // goes untested.
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n"];

      let version = 1;
      const failures: string[] = [];
      const EDITS = 200;
      for (let n = 0; n < EDITS; n++) {
        const insert = inserts[Math.floor(rand() * inserts.length)]!;
        const delLen = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 10), 16) : 0;
        if (insert === "" && delLen === 0) continue;
        const offset = Math.floor(rand() * text.length);
        const start = posAt(text, offset);
        const end = posAt(text, Math.min(offset + delLen, text.length));
        version += 1;
        incr.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [{ range: { start, end }, text: insert }],
        });
        text = text.slice(0, offset) + insert + text.slice(offset + delLen);
        const incrSig = fieldSig(incr.compile({ textDocument: { uri: URI } }).program);
        const coldSig = fieldSig(coldProgram(text));
        const diverged = Object.keys(incrSig).filter((f) => incrSig[f] !== coldSig[f]);
        if (diverged.length) {
          failures.push(`#${n} insert=${JSON.stringify(insert)} del=${delLen} @${offset} fields={${diverged.join(",")}}`);
        }
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });

  // Pins the synthetic-name REBINDING drift: `canonicalizeSyntheticFlowNames`
  // renumbers synthetics by document order and mutates the parsed IR in place,
  // so a carried-forward node's name is already `__synth_k` on the next compile.
  // Deleting a synthetic EARLIER in the document must (a) renumber the carried
  // ordinal (the canonical form must itself match the pass's SYNTH regex, else
  // the stale `__synth_1` survives while cold derives `__synth_0`), and (b) not
  // let a name-keyed flow cache (incremental ToJson / location cache) splice the
  // DELETED flow's cached entry into the flow that inherited its name — the two
  // function knots here are same-shaped, so the cross-flow fingerprint cannot
  // tell them apart; only excluding positional names from reuse is sound.
  it("renumbers carried synthetic flows and never splices a stale flow-cache entry", () => {
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
      // after the first flow's start (so the flow-reuse global guard stays ok)
      // and more than one line away from f2's flow (so f2's chunk is reusable).
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
