import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///rename.sd";
const sets = ["declarations", "references", "semantics"] as const;
function open(text: string) {
  const registry = new SparkdownDocumentRegistry([...sets]);
  registry.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  return registry;
}
function position(text: string, offset: number) {
  const prefix = text.slice(0, offset).split("\n");
  return { line: prefix.length - 1, character: prefix.at(-1)!.length };
}
function snapshot(registry: SparkdownDocumentRegistry) {
  return sets.flatMap((key) => {
    const result: string[] = [];
    const iter = registry.annotations(URI)![key]!.iter();
    while (iter.value) {
      result.push(`${key}:${iter.from}:${iter.to}:${JSON.stringify(iter.value.type)}`);
      iter.next();
    }
    return result;
  });
}
function expectParity(registry: SparkdownDocumentRegistry, text: string, label: string) {
  const cold = open(text);
  expect(registry.tree(URI)!.toString(), `${label}: parse trees`).toBe(cold.tree(URI)!.toString());
  const actual = snapshot(registry);
  const expected = snapshot(cold);
  expect({ extra: actual.filter((value) => !expected.includes(value)), missing: expected.filter((value) => !actual.includes(value)) }, label).toEqual({ extra: [], missing: [] });
  expect(actual, `${label}: order and multiplicity`).toEqual(expected);
}
function fixture(local: boolean) {
  const padding = Array.from({ length: 300 }, (_, i) => `  local pad_${i} = ${i} + 1`);
  return local
    ? ["function tally()", "  local trust = 0", ...padding, "  return trust", "end", "", "scene finish", "  Done.", ""].join("\n")
    : ["store trust = 0", "", ...Array.from({ length: 80 }, (_, i) => [
        `scene room_${i}`, "hero:", `  Room ${i} holds {trust} and {future}.`, "end", "",
      ].join("\n"))].join("\n");
}

describe("incremental declaration invalidation", () => {
  for (const local of [false, true]) {
    it(`updates distant references after a ${local ? "local" : "global"} rename and undo`, () => {
      let text = fixture(local);
      const registry = open(text);
      let version = 2;
      const at = text.indexOf("trust") + 3;
      let narrow = 0;
      for (const insert of ["q", "q", "q", "", "", ""]) {
        const deleting = insert === "";
        const start = position(text, at);
        const end = position(text, at + (deleting ? 1 : 0));
        registry.update({ textDocument: { uri: URI, version: version++ }, contentChanges: [{ range: { start, end }, text: insert }] });
        text = text.slice(0, at) + insert + text.slice(at + (deleting ? 1 : 0));
        const span = registry.tree(URI)!.prop(cachedCompilerProp);
        if (span?.reparsedTo != null && span.reparsedTo < text.lastIndexOf("trust")) narrow++;
        expectParity(registry, text, `edit ${version - 2}, window ends ${span?.reparsedTo}`);
      }
      expect(narrow, "the parser must leave distant references outside its window").toBeGreaterThan(0);
    });
  }

  for (const [label, initial, before, after] of [
    ["delete declaration", fixture(false), "store trust = 0\n", ""],
    ["introduce previously unresolved name", fixture(false), "trust =", "future ="],
    ["change readonly modifiers", fixture(false), "store", "const"],
    ["change callable kind", fixture(false), "trust = 0", "trust = function() end"],
    ["restore stdlib after shadow rename", fixture(false).replaceAll("trust", "print"), "store print", "store printer"],
    ["rename function parameter", fixture(true).replace("tally()\n  local trust = 0", "tally(trust)"), "tally(trust)", "tally(other)"],
    ["rename named function", fixture(false).replace("store trust = 0", "function trust()\n  return 0\nend"), "function trust", "function other"],
    ["preserve nested shadow", fixture(true).replace("  return trust", "  local nested = function()\n    local trust = 1\n    return trust\n  end\n  return trust"), "local trust = 0", "local other = 0"],
  ]) {
    it(label!, () => {
      let text = initial!;
      const registry = open(text);
      // Establish parser reuse without changing a binding first.
      const warm = text.indexOf("\n");
      registry.update({ textDocument: { uri: URI, version: 2 }, contentChanges: [{ range: { start: position(text, warm), end: position(text, warm) }, text: " " }] });
      text = text.slice(0, warm) + " " + text.slice(warm);
      // Whole-line deletion must include the harmless warm-up space.
      const needle = before!.includes("\n") ? before!.replace("\n", " \n") : before!;
      const at = text.indexOf(needle);
      expect(at).toBeGreaterThanOrEqual(0);
      registry.update({ textDocument: { uri: URI, version: 3 }, contentChanges: [{ range: { start: position(text, at), end: position(text, at + needle.length) }, text: after! }] });
      text = text.slice(0, at) + after + text.slice(at + needle.length);
      expectParity(registry, text, label!);
    });
  }
});
