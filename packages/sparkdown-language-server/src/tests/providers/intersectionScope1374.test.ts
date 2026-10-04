import { expect, test } from "vitest";
import { labelsAt } from "./completionHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getDeclarationScopes } from "../../utils/annotations/getDeclarationScopes";

function scopeNamesAt(source: string, at: string): string[] {
  const marker = source.indexOf(`@${at}`);
  const offset = source.slice(0, marker).replace(/@[0-9]/g, "").length;
  const text = source.replace(/@[0-9]/g, "");
  const uri = "file:///1374.sd";
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  const scripts = new Map([[uri, {
    annotations: documents.annotations(uri),
    tree: documents.tree(uri),
    read: (from: number, to: number) => documents.get(uri)!.read(from, to),
  }]]);
  return Object.values(getDeclarationScopes(scripts, { uri, offset })[""] ?? {}).flat();
}

test("intersection initializer hides its local until the complete declaration", () => {
  for (const newline of ["\n", "\r\n"]) {
    const source = [
      "function main()",
      "  local value: { x: number }",
      "  -- continuation",
      "    & { y: string } = v@1",
      "  return v@2",
      "end",
      "function other() return v@3 end",
      "",
    ].join(newline);
    // The document registry normalizes CRLF before the LSP sees offsets.
    const normalized = source.replace(/\r\n/g, "\n");
    expect(labelsAt(normalized, { at: "1" })).not.toContain("value");
    expect(labelsAt(normalized, { at: "2" })).toContain("value");
    expect(labelsAt(normalized, { at: "3" })).not.toContain("value");
  }
});

test("bounded named function locals and parameters stay in their declaring scope", () => {
  const source = "do\n  & local function inner(arg) return i@1(a@2) end\n  {i@3}\nend\n{i@4} {a@5}\n";
  expect(scopeNamesAt(source, "1")).toContain("inner");
  expect(scopeNamesAt(source, "2")).toContain("arg");
  expect(scopeNamesAt(source, "3")).toContain("inner");
  expect(scopeNamesAt(source, "4")).not.toContain("inner");
  expect(scopeNamesAt(source, "5")).not.toContain("arg");
});

test("bounded anonymous parameters do not become global declarations", () => {
  const source = "& local f = function(arg) return a@1 end\n{a@2}\n";
  expect(labelsAt(source, { at: "1" })).toContain("arg");
  expect(labelsAt(source, { at: "2" })).not.toContain("arg");
});

test("canonical locals, shadowing and scene parameters keep their scope", () => {
  const source = "store value = 1\nfunction f(arg)\n  local value = v@1\n  v@2\n  a@3\nend\n{a@4}\nscene passage(arg):\n{a@5}\nend\n{a@6}\n";
  expect(labelsAt(source, { at: "1" })).toContain("value");
  expect(labelsAt(source, { at: "2" })).toContain("value");
  expect(labelsAt(source, { at: "3" })).toContain("arg");
  expect(labelsAt(source, { at: "4" })).not.toContain("arg");
  expect(labelsAt(source, { at: "5" })).toContain("arg");
  expect(labelsAt(source, { at: "6" })).not.toContain("arg");
});
