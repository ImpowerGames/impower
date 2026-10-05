import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getDeclarationHeadings } from "../../utils/annotations/getDeclarationHeadings";
import { getDocumentSymbols } from "../../utils/providers/getDocumentSymbols";

const URI = "file:///function-twin-outline.sd";

function outline(text: string) {
  const registry = new SparkdownDocumentRegistry(["declarations"]);
  registry.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const document = registry.get(URI)!;
  const annotations = registry.annotations(URI)!;
  const tree = registry.tree(URI);
  return {
    headings: getDeclarationHeadings(document, annotations, tree),
    symbols: getDocumentSymbols(document, annotations, tree),
  };
}

describe.each([
  ["canonical LF", "", "\n"],
  ["bounded LF", "& ", "\n"],
  ["canonical CRLF", "", "\r\n"],
  ["bounded CRLF", "& ", "\r\n"],
] as const)("function outline identity: %s", (_label, prefix, newline) => {
  test("the full outer extent contains a nested function and excludes the following declaration", () => {
    const line = `${prefix}function outer() local function inner() return 1 end return inner() end`;
    const second = `${prefix}function after() return 2 end`;
    const { headings, symbols } = outline([line, second, "Following."].join(newline));
    expect(headings.map(h => h.name)).toEqual(["outer", "after"]);
    expect(headings[0]!.end).toEqual({ line: 0, character: line.length });
    expect(headings[0]!.children.map(h => h.name)).toEqual(["inner"]);
    const innerEnd = line.indexOf(" end") + " end".length;
    expect(headings[0]!.children[0]!.end).toEqual({ line: 0, character: innerEnd });
    expect(headings[1]!.end).toEqual({ line: 1, character: second.length });
    expect(symbols.map(s => s.name)).toEqual(["outer", "after"]);
    expect(symbols[0]!.range).toEqual({ start: { line: 0, character: 0 }, end: { line: 0, character: line.length } });
    expect(symbols[0]!.children?.map(s => s.name)).toEqual(["inner"]);
    expect(symbols[0]!.children![0]!.range.end).toEqual({ line: 0, character: innerEnd });
    expect(symbols[1]!.children).toBeUndefined();
  });

  test("a scene contains the complete function hierarchy", () => {
    const line = `  ${prefix}function outer() local function inner() return 1 end return inner() end`;
    const { headings, symbols } = outline(["scene A", line, "  Following.", "end", ""].join(newline));
    expect(headings.map(h => h.name)).toEqual(["A"]);
    expect(headings[0]!.children.map(h => h.name)).toEqual(["outer"]);
    const outer = headings[0]!.children[0]!;
    expect(outer.end).toEqual({ line: 1, character: line.length });
    expect(outer.children.map(h => h.name)).toEqual(["inner"]);
    expect(symbols[0]!.children![0]!.children?.map(s => s.name)).toEqual(["inner"]);
    expect(symbols[0]!.range.end).toEqual({ line: 3, character: 3 });
  });
});

test.each(["\n", "\r\n"])("an incomplete bounded function ends at its physical line (%j)", newline => {
  const line = "& function outer() local function inner() return 1 end";
  const second = "& function after() return 2 end";
  const { headings, symbols } = outline([line, second, "Following."].join(newline));
  expect(headings.map(h => h.name)).toEqual(["outer", "after"]);
  expect(headings[0]!.end).toEqual({ line: 0, character: line.length });
  expect(headings[0]!.children.map(h => h.name)).toEqual(["inner"]);
  expect(headings[1]!.end).toEqual({ line: 1, character: second.length });
  expect(symbols[0]!.range.end).toEqual({ line: 0, character: line.length });
});

test("canonical multiline functions retain their nesting and closing lines", () => {
  const { headings, symbols } = outline("function outer()\nlocal function inner()\nreturn 1\nend\nreturn inner()\nend\nFollowing.\n");
  expect(headings.map(h => h.name)).toEqual(["outer"]);
  expect(headings[0]!.end).toEqual({ line: 5, character: 3 });
  expect(headings[0]!.children.map(h => h.name)).toEqual(["inner"]);
  expect(headings[0]!.children[0]!.end).toEqual({ line: 3, character: 3 });
  expect(symbols[0]!.children![0]!.range.end).toEqual({ line: 3, character: 3 });
});
