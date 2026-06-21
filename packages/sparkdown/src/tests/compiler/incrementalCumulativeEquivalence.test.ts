// Cumulative-path byte-identity oracle for the compiled bytecode.
//
// The existing `incrementalEquivalence` oracle applies each edit from a FRESHLY
// configured compiler (single-edit reuse). This one drives MANY edits through
// ONE persistent compiler — the real editor HMR pattern — and after each edit
// compares the emitted `program.compiled` to a cold compile of the same text.
//
// This is the path that exposed the synthetic-name drift: compiler-synthesized
// identifiers (`__anon_fn_<from>`, `__define_fn_<from>`, loop vars/labels, …)
// were minted from absolute source offsets and frozen into per-chunk lowered IR
// that the incremental pipeline reuses-and-shifts without re-lowering, so a
// carried-forward chunk kept a stale offset while a cold compile re-derived the
// current one — diverging the bytecode. `SparkdownCompiler.canonicalizeSyntheticFlowNames`
// renumbers these names by document order over the assembled tree every compile,
// which this test pins (it fails ~25/400 edits without that pass).
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

function coldCompiledJson(text: string): string {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return JSON.stringify(c.compile({ textDocument: { uri: URI } }).program.compiled);
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

describe("compiler cumulative incremental equivalence (compiled)", () => {
  it("incremental compiled == cold across many cumulative edits on ONE compiler", () => {
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
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "{scene_2}", "hero:", "-> scene_5"];

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
        const incrJson = JSON.stringify(
          incr.compile({ textDocument: { uri: URI } }).program.compiled,
        );
        if (incrJson !== coldCompiledJson(text)) {
          failures.push(`#${n} insert=${JSON.stringify(insert)} del=${delLen} @${offset}`);
        }
      }
      expect(failures, `compiled divergences:\n${failures.join("\n")}`).toEqual([]);
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });
});
