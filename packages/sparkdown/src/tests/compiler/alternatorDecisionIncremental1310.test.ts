import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { Editor, expectParity, openRegistry } from "./incrementalParity";

const URI = "inmemory:///alternator.sd";

function tokenAt(registry: SparkdownDocumentRegistry, from: number, name: string): string | undefined {
  let found: string | undefined;
  registry.annotations(URI)!.semantics!.between(from, from + name.length, (start, end, value) => {
    if (start === from && end === from + name.length) found = (value.type as { tokenType?: string }).tokenType;
  });
  return found;
}

describe("an edit far from a structural word keeps its annotations", () => {
  it("adding and removing the arms recolours the word", () => {
    const narrative = Array.from({ length: 25 }, (_, i) => `Line ${i}.`);
    const comments = Array.from({ length: 30 }, (_, i) => `  -- note ${i}`);
    const text = [...narrative, "function f(n)", "  local match = function(x) return x end", "  match(n)", ...comments, "  return 3", "end", ""].join("\n");
    const editor = new Editor(openRegistry(URI, text), URI, text);
    const word = text.indexOf("match(n)");
    expect(tokenAt(editor.registry, word, "match")).toBe("function");
    const note = editor.text.indexOf("note 10");
    editor.replace(note, note + 4, "nota");
    expectParity(editor.registry, URI, editor.text, "warm-up");
    const arms = "    | x = print(1)\n  end\n";
    const at = editor.text.indexOf("  return 3");
    editor.replace(at, at, arms);
    const added = editor.registry.tree(URI)!.prop(cachedCompilerProp);
    expectParity(editor.registry, URI, editor.text, `arms added, window ${added?.reparsedFrom}..${added?.reparsedTo}`);
    expect(tokenAt(editor.registry, word, "match")).toBeUndefined();
    editor.replace(at, at + arms.length, "");
    expectParity(editor.registry, URI, editor.text, "arms removed");
    expect(tokenAt(editor.registry, word, "match")).toBe("function");
  });

  it("renaming a global function the word calls updates its token", () => {
    const scenes = Array.from({ length: 80 }, (_, i) => `scene room_${i}\n  Room ${i}.\nend\n`);
    const text = ["function match(n) return n end", "", ...scenes, "Value {match(1)}.", ""].join("\n");
    const editor = new Editor(openRegistry(URI, text), URI, text);
    const word = text.lastIndexOf("match");
    expect(tokenAt(editor.registry, word, "match")).toBe("function");
    editor.replace(9, 14, "other");
    expectParity(editor.registry, URI, editor.text, "renamed");
    expect(tokenAt(editor.registry, word, "match")).toBe("variable");
    editor.replace(9, 14, "match");
    expectParity(editor.registry, URI, editor.text, "renamed back");
    expect(tokenAt(editor.registry, word, "match")).toBe("function");
  });

  it("renaming a local the word calls updates its token", () => {
    const pad = Array.from({ length: 100 }, (_, i) => `  local pad_${i} = ${i}`);
    const text = ["function f()", "  local match = function(x) return x end", ...pad, "  match(1)", "end", ""].join("\n");
    const editor = new Editor(openRegistry(URI, text), URI, text);
    const word = text.lastIndexOf("match");
    expect(tokenAt(editor.registry, word, "match")).toBe("function");
    const pad5 = editor.text.indexOf("pad_5 ");
    editor.replace(pad5, pad5 + 5, "pad_x");
    expectParity(editor.registry, URI, editor.text, "warm-up");
    const declared = editor.text.indexOf("local match") + 6;
    editor.replace(declared, declared + 5, "other");
    expectParity(editor.registry, URI, editor.text, "renamed");
    expect(tokenAt(editor.registry, word, "match")).toBe("variable");
  });
});
