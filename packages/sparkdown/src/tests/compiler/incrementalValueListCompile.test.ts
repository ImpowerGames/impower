// A value-list name (`x` in `local a, b = 1, x`) depends on an earlier name's
// `=` (#1116), and `CompilationAnnotator` reads that answer when it lowers a
// chunk. After incremental edits to such a list, the compiled program must be
// byte-identical to a cold compile of the same text, as
// `incrementalEquivalence.test.ts` requires for the rest of the language.
// A chunk is lowered again whole, so this holds with or without the editor's
// widened annotation window (`incrementalValueListParity.test.ts` pins that);
// it guards the compile path itself.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const file = (text: string) => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function pick(p: any) {
  return {
    compiled: p.compiled,
    pathLocations: p.pathLocations,
    dataLocations: p.dataLocations,
    functionLocations: p.functionLocations,
    context: p.context,
    diagnostics: p.diagnostics,
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

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

function cold(text: string) {
  const c = new SparkdownCompiler();
  c.configure({ files: [file(text)] });
  return stable(pick(c.compile({ textDocument: { uri: URI } }).program));
}

const pad = (tag: string) => Array.from({ length: 20 }, (_, i) => `  local ${tag}_${i} = ${i} + 1`);
const rows = Array.from({ length: 40 }, (_, i) => `    row_${i} = ${i} + 1,`);

const SCRIPT = [
  "Value {f()} and {g()}.",
  "",
  "function helper()",
  "  return 2",
  "end",
  "",
  "function f()",
  ...pad("pre"),
  "  local x = 5",
  "  local aa, bb == 1,",
  "    x",
  "  local cc, dd = 1, helper -- note",
  "  local t, u = {",
  ...rows,
  "  }, x",
  ...pad("post"),
  "  return helper() + x",
  "end",
  "",
  "function g()",
  "  local y = 3",
  "  local inner = function()",
  "    local p, q == 1,",
  "      y",
  "    return y",
  "  end",
  "  return inner()",
  "end",
  "",
].join("\n");

// Each step is a find -> replace on the first occurrence, applied in order.
const STEPS: [string, string, string][] = [
  ["warm-up inside f", "pre_5 = 5 + 1", "pre_5 = 5 +  1"],
  ["the list gains its `=`", "aa, bb ==", "aa, bb ="],
  ["an edit inside the table value", "row_20 = 20 + 1", "row_20 = 20 +  1"],
  ["the list loses its `=`", "aa, bb =", "aa, bb =="],
  ["a name gains a comment", "    x\n  local cc", "    x -- c\n  local cc"],
  ["pasting `= 1` back", "aa, bb == 1", "aa, bb = 1"],
  ["a later name gains its own `=`", "helper -- note", "helper = 3 -- note"],
  ["the nested list gains its `=`", "p, q ==", "p, q ="],
  ["the table closes early", "row_39 = 39 + 1,\n  }, x", "row_39 = 39 + 1,\n  }, x, y"],
];

describe("incremental compiles of a value list", () => {
  it("match a cold compile after every edit", () => {
    const c = new SparkdownCompiler();
    c.configure({ files: [file(SCRIPT)] });
    c.compile({ textDocument: { uri: URI } });
    let text = SCRIPT;
    let version = 1;
    for (const [name, find, replace] of STEPS) {
      const from = text.indexOf(find);
      expect(from, `"${find}" is in the script (${name})`).toBeGreaterThanOrEqual(0);
      version += 1;
      c.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [{ range: { start: posAt(text, from), end: posAt(text, from + find.length) }, text: replace }],
      });
      text = text.slice(0, from) + replace + text.slice(from + find.length);
      const incremental = stable(pick(c.compile({ textDocument: { uri: URI } }).program));
      expect(incremental, name).toBe(cold(text));
    }
  });
});
