// Design-agnostic byte-identical oracle for compiler incrementality.
//
// For each of many DIVERSE edits, compares two programs compiled from the SAME
// resulting text:
//   - INCREMENTAL: one persistent compiler driven by updateDocument + compile
//     applying a MINIMAL-RANGE edit (a real keystroke-sized change), so the
//     incremental parser carries forward unchanged chunks and the per-chunk
//     reuse path is genuinely exercised.
//   - COLD: a fresh compiler configured from the post-edit text from scratch.
// They must be byte-identical across compiled ink JSON + every *Locations map +
// context + diagnostics + ui + colorAnnotations. Any incrementality bug (stale
// cache, missed cross-flow invalidation — visit counts, divert paths, renames,
// line shifts) flips this.
//
// This is the gold-standard safety net the incremental work is built against;
// it uses a screenplay with cross-flow coupling (diverts between scenes,
// read-counts, defines/tables, chained dialogue) — exactly where naive
// per-chunk reuse breaks — not the uniform perf fixture.
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// A structurally varied screenplay with cross-flow references.
function coupledScreenplay(): string {
  const L: string[] = [];
  L.push("title: Incr Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("");
  L.push("define cfg as object:");
  L.push("  speed = 5");
  L.push("  items = { sword = 1, shield = 2 }");
  L.push("");
  L.push("store trust = 0");
  L.push("store visited_count = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  const SC = 14;
  for (let s = 0; s < SC; s++) {
    L.push(`= scene_${s}`);
    L.push(`INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in some detail here.`);
    L.push(`[[show backdrop room_${s % 4}]]`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}. > A chained beat after the break.`);
    L.push(`  Second line with {trust} and read-count {scene_${(s + 1) % SC}} here.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    // Cross-flow divert to another scene.
    L.push(`-> scene_${(s + 3) % SC}`);
    L.push("");
  }
  return L.join("\n");
}

// Each edit is a single find -> replace applied to the FIRST occurrence, turned
// into a minimal-range contentChange so only the affected region reparses.
interface Edit {
  name: string;
  find: string;
  replace: string;
}

const edits: Edit[] = [
  { name: "same-line char insert in dialogue", find: "Line one of dialogue in scene 5.", replace: "Line one of dialogue in scene 5x." },
  { name: "newline insert (shifts lines below)", find: "Action describing room 6 in some detail here.", replace: "Action describing room 6 in some detail here.\n  An extra action line." },
  { name: "edit define table value", find: "speed = 5", replace: "speed = 9" },
  { name: "add read-count reference (visit-count coupling)", find: "Not yet in scene 7.", replace: "Not yet in scene 7, {scene_2}." },
  { name: "remove a cross-flow divert", find: "-> scene_10", replace: "-> DONE" },
  { name: "change function body", find: "return x * 2 + 1", replace: "return x * 3 + 1" },
  { name: "edit store initial value", find: "store trust = 0", replace: "store trust = 1" },
  { name: "rename a scene (cross-flow divert target)", find: "= scene_4", replace: "= scene_renamed" },
  { name: "delete a whole line above many flows", find: "store visited_count = 0\n", replace: "" },
  { name: "append a whole new scene at end", find: "-> scene_2\n", replace: "-> scene_2\n\n= scene_extra\nINT. NEW - DAY\n:\n  Brand new action.\n-> DONE\n" },
];

function pick(p: any) {
  return {
    compiled: p.compiled,
    pathLocations: p.pathLocations,
    dataLocations: p.dataLocations,
    functionLocations: p.functionLocations,
    sceneLocations: p.sceneLocations,
    knotLocations: p.knotLocations,
    stitchLocations: p.stitchLocations,
    branchLocations: p.branchLocations,
    labelLocations: p.labelLocations,
    context: p.context,
    diagnostics: p.diagnostics,
    ui: p.ui,
    colorAnnotations: p.colorAnnotations,
    // Capture the EMISSION ORDER of pathLocations/dataLocations as arrays.
    // stable() sorts object keys, so it would NOT catch a reordering — but the
    // engine (Game.ts findClosestPath over Object.entries) depends on
    // pathLocations order, so an incremental scheme must reproduce it exactly.
    pathLocationsOrder: Object.keys(p.pathLocations ?? {}),
    dataLocationsOrder: Object.keys(p.dataLocations ?? {}),
  };
}

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

const URI = "inmemory:///main.sd";

function coldCompile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return pick(c.compile({ textDocument: { uri: URI } }).program);
}

// Translate an absolute offset into a {line, character} position in `text`.
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

describe("compiler incremental equivalence", () => {
  // Each diverse edit is applied as a SINGLE minimal-range incremental update
  // from a freshly-configured compiler, then compared to a cold compile of the
  // resulting text. This isolates per-edit-type correctness (exactly what the
  // per-chunk caching must preserve) without conflating it with any pre-existing
  // accumulated incremental-parser state drift across long edit sequences (the
  // cumulative path is separately stressed by the fuzz test below).
  for (const edit of edits) {
    it(`incremental == cold for edit: ${edit.name}`, () => {
      const realWarn = console.warn;
      const realError = console.error;
      console.warn = () => {};
      console.error = () => {};
      try {
        const base = coupledScreenplay();
        const offset = base.indexOf(edit.find);
        expect(offset, `find "${edit.find}" present`).toBeGreaterThanOrEqual(0);
        const start = posAt(base, offset);
        const end = posAt(base, offset + edit.find.length);
        const after = base.slice(0, offset) + edit.replace + base.slice(offset + edit.find.length);

        const incr = new SparkdownCompiler();
        incr.configure({
          files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: base, version: 1, languageId: "sparkdown" }],
        });
        incr.compile({ textDocument: { uri: URI } });
        incr.updateDocument({
          textDocument: { uri: URI, version: 2 },
          contentChanges: [{ range: { start, end }, text: edit.replace }],
        });
        const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
        const coldProg = coldCompile(after);
        expect(stable(incrProg)).toBe(stable(coldProg));
      } finally {
        console.warn = realWarn;
        console.error = realError;
      }
    });
  }

  it("incremental == cold under randomized single-char edits (fuzz)", () => {
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

      // Deterministic LCG so the fuzz is reproducible (no Math.random).
      let seed = 0x2f6e2b1;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const inserts = ["x", "\n", " ", "1", "}", "{trust}"];

      let version = 1;
      for (let n = 0; n < 40; n++) {
        const insert = inserts[Math.floor(rand() * inserts.length)]!;
        const offset = Math.floor(rand() * text.length);
        const start = posAt(text, offset);
        version += 1;
        incr.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [{ range: { start, end: start }, text: insert }],
        });
        text = text.slice(0, offset) + insert + text.slice(offset);

        const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
        const coldProg = coldCompile(text);
        expect(stable(incrProg), `after fuzz edit #${n} insert ${JSON.stringify(insert)} @${offset}`).toBe(
          stable(coldProg),
        );
      }
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });
});
