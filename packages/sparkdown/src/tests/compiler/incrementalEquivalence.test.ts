// Design-agnostic byte-identical oracle for compiler incrementality.
//
// For each of many DIVERSE edits, compares two programs compiled from the SAME
// resulting text:
//   - INCREMENTAL: one persistent compiler driven by updateDocument + compile
//     (the HMR path; reuses cached per-chunk work once incrementality lands).
//   - COLD: a fresh compiler configured from the post-edit text from scratch.
// They must be byte-identical across compiled ink JSON + every *Locations map +
// context + diagnostics + ui. Any incrementality bug (stale cache, missed
// cross-flow invalidation — visit counts, divert paths, renames) flips this.
//
// This is the gold-standard safety net the incremental work is built against;
// it intentionally uses a screenplay with cross-flow coupling (diverts between
// scenes, read-counts, defines/tables) — exactly where naive per-chunk reuse
// breaks — not the uniform perf fixture.
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

interface Edit {
  name: string;
  // returns [find, replaceWith] applied to current text (first occurrence)
  apply: (text: string) => string;
}

const edits: Edit[] = [
  { name: "same-line char insert in dialogue", apply: (t) => t.replace("Line one of dialogue in scene 5.", "Line one of dialogue in scene 5x.") },
  { name: "newline insert (shifts lines below)", apply: (t) => t.replace("Action describing room 6 in some detail here.", "Action describing room 6 in some detail here.\n  An extra action line.") },
  { name: "edit define table value", apply: (t) => t.replace("speed = 5", "speed = 9") },
  { name: "add a read-count reference (changes visit-count coupling)", apply: (t) => t.replace("Not yet in scene 7.", "Not yet in scene 7, {scene_2}.") },
  { name: "remove a cross-flow divert", apply: (t) => t.replace("-> scene_10", "-> DONE") },
  { name: "change function body", apply: (t) => t.replace("return x * 2 + 1", "return x * 3 + 1") },
  { name: "edit store initial value", apply: (t) => t.replace("store trust = 0", "store trust = 1") },
  { name: "append a whole new scene at end", apply: (t) => t + "\n= scene_extra\nINT. NEW - DAY\n:\n  Brand new action.\n-> DONE\n" },
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
    // colorAnnotations is also a whole-document reference walk and is NOT in
    // the perfEquivalence gate's pick — include it here so incrementality can't
    // silently break it.
    colorAnnotations: p.colorAnnotations,
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

function coldCompile(text: string) {
  const uri = "inmemory:///main.sd";
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return pick(c.compile({ textDocument: { uri } }).program);
}

describe("compiler incremental equivalence", () => {
  it("incremental recompile == cold compile across diverse edits", () => {
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      const uri = "inmemory:///main.sd";
      let text = coupledScreenplay();

      // Persistent compiler (incremental path): configure once, then replace
      // the whole document text per edit via a full-range update + compile.
      const incr = new SparkdownCompiler();
      incr.configure({
        files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
      });
      incr.compile({ textDocument: { uri } });

      let version = 1;
      for (const edit of edits) {
        const next = edit.apply(text);
        expect(next, `edit "${edit.name}" should change the text`).not.toBe(text);

        // Apply as a full-document replacement so we exercise the incremental
        // path without hand-computing ranges. (The compiler diffs internally.)
        const lines = text.split("\n");
        version += 1;
        incr.updateDocument({
          textDocument: { uri, version },
          contentChanges: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: lines.length - 1, character: lines[lines.length - 1]!.length },
              },
              text: next,
            },
          ],
        });
        const incrProg = pick(incr.compile({ textDocument: { uri } }).program);
        const coldProg = coldCompile(next);

        expect(stable(incrProg), `after edit "${edit.name}"`).toBe(stable(coldProg));
        text = next;
      }
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });
});
