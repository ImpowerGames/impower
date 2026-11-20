import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";

const URI = "file:///provider.sd";

const sourceOf = (name: string) =>
  ["define ada as character with", `  name = ${name}`, "end", "", "scene start", "  Ada:", "    Hello.", "end", ""].join(
    String.fromCharCode(10),
  );

const renamed = (source: string, newName: string) => {
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  const workspace = {
    annotations: (uri: string) => documents.annotations(uri),
    document: (uri: string) => documents.get(uri),
    tree: (uri: string) => documents.tree(uri),
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as never;
  const offset = source.indexOf("Ada:") + 1;
  const before = source.slice(0, offset);
  const position = { line: before.split(String.fromCharCode(10)).length - 1, character: offset - (before.lastIndexOf(String.fromCharCode(10)) + 1) };
  const edits = getRenameEdits(undefined, documents.get(URI), documents.tree(URI), undefined, workspace, newName, position);
  const document = documents.get(URI)!;
  let text = source;
  for (const change of [...(edits?.changes?.[URI] ?? [])].sort(
    (a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start),
  )) {
    text = text.slice(0, document.offsetAt(change.range.start)) + change.newText + text.slice(document.offsetAt(change.range.end));
  }
  return text;
};

describe("renaming a character display name written as a long-bracket or backtick string", () => {
  test.each([
    ["[[Ada]]", "[[Eve]]"],
    ["[==[Ada]==]", "[==[Eve]==]"],
    ["`Ada`", "`Eve`"],
  ])("renaming the cue of %s renames the string and the cue", (name, expected) => {
    const text = renamed(sourceOf(name), "Eve");
    expect(text).toContain(`  name = ${expected}`);
    expect(text).toContain("  Eve:");
  });

  test.each([
    ["[[Ada]]", "E]]ve"],
    ["[[Ada]]", "Eve]"],
    ["[==[Ada]==]", "E]==]ve"],
    ["`Ada`", "E`ve"],
    ["`Ada`", "E{ve"],
  ])("renaming the cue of %s to %s, which would close or break the string, is refused", (name, newName) => {
    expect(() => renamed(sourceOf(name), newName)).toThrow(/is not a valid cue name/);
  });
});
