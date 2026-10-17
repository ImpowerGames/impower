import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getCompletions } from "../../utils/providers/getCompletions";
import { getAnnotatedScripts } from "../../utils/annotations/getAnnotatedScripts";

const constant = "const t = { field = 1 }\n";
const narrative = (receiver = "t") => `scene start\n  Value: {${receiver}.@1}\nend\n`;
const method = (body: string, parameter = "") => `define Point with\n  function inspect(${parameter})\n${body}\n  end\nend\n`;

const contexts: [string, string][] = [
  ["narrative interpolation", constant + narrative()],
  ["direct define property", constant + "define Point with\n  value = t.@1\nend\n"],
  ["explicit define method", constant + method("    return t.@1")],
  ["shorthand define method", constant + "define Point with\n  inspect()\n    return t.@1\n  end\nend\n"],
  ["property function", constant + "define Point with\n  callback = function() return t.@1 end\nend\n"],
  ["Sparkle handler", constant + 'layout hud with\n  button "Go" @click={ return t.@1 }\nend\n'],
  ["ordinary function control", constant + "function main()\n  return t.@1\nend\n"],
  ["declaration after cursor", narrative() + constant],
  ["constant in another scene", "scene first\n  const t = { field = 1 }\nend\n" + narrative()],
  ["constant in an ordinary function is global", "function seed()\n  const t = { field = 1 }\nend\n" + narrative()],
  ["constant in another define method is global", "define Point with\n  function seed()\n    const t = { field = 1 }\n  end\n  function inspect()\n    return t.@1\n  end\nend\n"],
  ["constant in a property function is global", "define Point with\n  callback = function()\n    const t = { field = 1 }\n  end\nend\n" + narrative()],
];

const shadows: [string, string, string[]][] = [
  ["narrative local", constant + "scene start\n  local t = { localField = 1 }\n  Value: {t.@1}\nend\n", ["localField"]],
  ["method local", constant + method("    local t = { localField = 1 }\n    return t.@1"), ["localField"]],
  ["property-function local", constant + "define Point with\n  callback = function()\n    local t = { localField = 1 }\n    return t.@1\n  end\nend\n", ["localField"]],
  ["method parameter", constant + method("    return t.@1", "t"), []],
  ["property-function parameter", constant + "define Point with\n  callback = function(t) return t.@1 end\nend\n", []],
  ["handler local", constant + 'layout hud with\n  button "Go" @click={ local t = { localField = 1 }; return t.@1 }\nend\n', ["localField"]],
  ["loop parameter", constant + 'layout hud with\n  for t in {} do\n    text "{t.@1}"\n  end\nend\n', []],
  ["sibling parameter never hides constant", constant + "define Point with\n  function first(t) end\n  function inspect() return t.@1 end\nend\n", ["field"]],
];

function project(source: string, foreign: string, reverse: boolean) {
  const main = "file:///proj/main.sd";
  const library = "file:///proj/constants.sd";
  const text = source.replace("@1", "");
  const cursor = source.indexOf("@1");
  expect(cursor).toBeGreaterThanOrEqual(0);
  const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
  documents.set({ textDocument: { uri: main, text, version: 1, languageId: "sparkdown" } });
  documents.set({ textDocument: { uri: library, text: foreign, version: 1, languageId: "sparkdown" } });
  const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
  const uris = reverse ? [library, main] : [main, library];
  const request = () => {
    const document = documents.get(main)!;
    return (getCompletions(document, documents.tree(main), getAnnotatedScripts(main, Object.fromEntries(uris.map((uri) => [uri, 1])), workspace), undefined, undefined, document.positionAt(cursor), undefined) ?? []).map((item) => item.label).sort();
  };
  return { request, documents, main, library };
}

describe("constant member receivers retain global story-start identity (#867)", () => {
  test.each(contexts)("%s", (_name, source) => {
    expect(labelsAt(source).sort()).toEqual(["field"]);
  });

  test.each(shadows)("constant is hidden only by the actual %s", (_name, source, expected) => {
    expect(labelsAt(source).sort()).toEqual(expected);
  });

  test.each([
    ["forward constant dependency", "const alias = t\n" + constant + narrative("alias")],
    ["store initializes from a later constant", "store alias = t\n" + constant + narrative("alias")],
    ["constant alias keeps its global identity under a local shadow", constant + "const alias = t\nscene start\n  local t = { localField = 1 }\n  Value: {alias.@1}\nend\n"],
  ])("%s", (_name, source) => {
    expect(labelsAt(source!).sort()).toEqual(["field"]);
  });

  test.each([
    "const t = t\n" + narrative(),
    "const t = other\nconst other = t\n" + narrative(),
  ])("cyclic constant dependencies contribute no guessed fields: %s", (source) => {
    expect(labelsAt(source)).toEqual([]);
  });

  test.each([false, true].flatMap((reverse) => [
    { reverse, name: "narrative", source: narrative() },
    { reverse, name: "define method", source: method("    return t.@1") },
    { reverse, name: "define property", source: "define Point with\n  value = t.@1\nend\n" },
    { reverse, name: "ordinary function", source: "function main()\n  return t.@1\nend\n" },
  ]))("foreign constant belongs to its owner ($name, reverse=$reverse)", ({ source, reverse }) => {
    const { request } = project(source, constant, reverse);
    expect(request()).toEqual(["field"]);
    expect(request()).toEqual(["field"]);
  });

  test.each([false, true])("a foreign constant cannot replace a current later store (reverse=%s)", (reverse) => {
    const { request } = project(narrative() + "store t = { currentField = 1 }\n", constant, reverse);
    expect(request()).toEqual(["currentField"]);
  });

  test.each([false, true])("a foreign constant cannot bypass a current parameter (reverse=%s)", (reverse) => {
    const { request } = project(method("    return t.@1", "t"), constant, reverse);
    expect(request()).toEqual([]);
  });

  test("constant alias mutations and cycles remain request-local", () => {
    const source = "const t = { inner = { initial = 1 } }\nfunction mutate()\n  local alias = t.inner\n  alias.extra = 1\n  alias.cycle = t\n  return t.inner.@1\nend\nfunction inspect()\n  return t.inner.\nend\n";
    const { request, documents, main } = project(source, "", false);
    expect(request()).toEqual(["cycle", "extra", "initial"]);
    const document = documents.get(main)!;
    const cursor = document.getText().lastIndexOf("t.inner.") + "t.inner.".length;
    const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
    const inspect = () => (getCompletions(document, documents.tree(main), getAnnotatedScripts(main, undefined, workspace), undefined, undefined, document.positionAt(cursor), undefined) ?? []).map((item) => item.label).sort();
    expect(inspect()).toEqual(["initial"]);
    expect(request()).toEqual(["cycle", "extra", "initial"]);
    expect(inspect()).toEqual(["initial"]);
  });

  test("a warm foreign constant updates without changing the requesting tree", () => {
    const { request, documents, main, library } = project(narrative(), "const t = { before = 1 }\n", false);
    const tree = documents.tree(main);
    expect(request()).toEqual(["before"]);
    documents.update({ textDocument: { uri: library, version: 2 }, contentChanges: [{ text: "const t = { afterx = 1 }\n" }] });
    expect(documents.tree(main) === tree).toBe(true);
    expect(request()).toEqual(["afterx"]);
  });
});
