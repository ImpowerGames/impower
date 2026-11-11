import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { canRename } from "../../utils/providers/canRename";
import { getHover } from "../../utils/providers/getHover";
import { getReferences } from "../../utils/providers/getReferences";
import { getRenameRefusal } from "../../utils/providers/getRenameRefusal";
import { compileProject, complete } from "./completionHarness";

const URI = "file:///proj/main.sd";
const ASSETS = [
  { name: "mia", ext: "svg", type: "image" as const },
  { name: "mia@night", ext: "svg", type: "image" as const },
];

const SCRIPT = `define mia@party as filtered_image with
  image = image.mia@night
end

scene start
  [[mia]]
  [[mia@night]]
  [[mia@party]]
  & local word@count = 1
  & word@count = word@count + 1
end
`;

const program = compileProject(SCRIPT, ASSETS);

const at = (source: string, needle: string, offset = 0) => {
  const index = source.indexOf(needle) + offset;
  const before = source.slice(0, index);
  return { line: before.split("\n").length - 1, character: index - (before.lastIndexOf("\n") + 1) };
};

const open = (text: string) => {
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const workspace = {
    annotations: (uri: string) => documents.annotations(uri),
    document: (uri: string) => documents.get(uri),
    tree: (uri: string) => documents.tree(uri),
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as any;
  return { documents, workspace, document: documents.get(URI)!, tree: documents.tree(URI) };
};

type Edit = { newText: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } };

const accepted = (source: string, label: string) => {
  const { items } = complete(source, { program });
  const item = items.find((candidate) => candidate.label === label);
  expect(item, `${label} in ${items.map((i) => i.label).join(", ")}`).toBeDefined();
  const cursor = at(source, "@1");
  const lines = source.replace(/@1/, "").split("\n");
  const line = lines[cursor.line]!;
  const word = /[\p{L}\p{N}_]*$/u.exec(line.slice(0, cursor.character))![0];
  const edit = (item!.textEdit as Edit | undefined) ?? {
    newText: String(item!.insertText ?? item!.label),
    range: { start: { line: cursor.line, character: cursor.character - word.length }, end: cursor },
  };
  const edited = lines[edit.range.start.line]!;
  lines[edit.range.start.line] = edited.slice(0, edit.range.start.character) + edit.newText + edited.slice(edit.range.end.character);
  return lines.join("\n");
};

describe("@ inside names in the language server (#2109)", () => {
  it.each([
    ["[[mi@1]]", "[[mia@night]]"],
    ["[[mia@@1]]", "[[mia@night]]"],
    ["[[mia@ni@1]]", "[[mia@night]]"],
    ["[[mia@ni@1:happy]]", "[[mia@night:happy]]"],
  ])("offers the @ image after [[ and replaces the whole typed name: %s", (source, text) => {
    expect(accepted(source, "mia@night")).toBe(text);
  });

  it("offers the @ named look after [[", () => {
    expect(accepted("[[mia@p@1]]", "mia@party")).toBe("[[mia@party]]");
  });

  it.each([
    ["background_image = image.@1", "background_image = image.mia@night"],
    ["background_image = image.mi@1", "background_image = image.mia@night"],
    ["background_image = image.mia@@1", "background_image = image.mia@night"],
    ["background_image = image.mia@ni@1", "background_image = image.mia@night"],
  ])("offers the @ image after image. and replaces the whole typed name: %s", (line, text) => {
    expect(accepted(`style card {\n  ${line}\n}\n`, "mia@night")).toBe(`style card {\n  ${text}\n}\n`);
  });

  it.each([
    ["[[mia]]", "mia", 1],
    ["[[mia@night]]", "mia@night", 2],
    ["[[mia@night]]", "mia@night", 6],
  ])("hovers %s as the one name %s, %i characters into it", async (needle, name, offset) => {
    const { document, tree, documents } = open(SCRIPT);
    const start = at(SCRIPT, needle, 2);
    const hover = await getHover(document, tree, documents.annotations(URI), program, undefined, { line: start.line, character: start.character + offset });
    expect(hover, needle).toBeTruthy();
    expect(hover!.range).toEqual({ start, end: { line: start.line, character: start.character + name.length } });
  });

  it("goes from a directive's @ named look to its define", () => {
    const { document, tree, workspace } = open(SCRIPT);
    const { references } = getReferences(document, tree, program, workspace, at(SCRIPT, "[[mia@party]]", 7), {
      searchOtherFiles: true,
      includeDeclaration: true,
      excludeUses: true,
      includeInterdependent: false,
      includeLinks: false,
    });
    expect((references ?? []).map((r) => r.range)).toContainEqual({ start: { line: 0, character: 7 }, end: { line: 0, character: 16 } });
  });

  it("renames an @ name as one word, to another @ name", () => {
    const { document, tree } = open(SCRIPT);
    const range = canRename(document, tree, at(SCRIPT, "word@count", 6));
    const start = at(SCRIPT, "word@count");
    expect(range).toMatchObject({ start, end: { line: start.line, character: start.character + "word@count".length } });
    const { workspace } = open(SCRIPT);
    const refusal = (name: string) => getRenameRefusal(workspace, program, "word@count", name, undefined);
    expect(refusal("word@total")).toBeNull();
    expect(refusal("@total")).toContain("is not a valid name");
    expect(refusal("word@")).toContain("is not a valid name");
    expect(refusal("word@@total")).toContain("is not a valid name");
  });
});
