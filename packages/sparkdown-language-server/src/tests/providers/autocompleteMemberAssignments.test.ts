import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getCompletions } from "../../utils/providers/getCompletions";
import { getAnnotatedScripts } from "../../utils/annotations/getAnnotatedScripts";

function requests(source: string, foreign: string, reverse: boolean, third?: string) {
  const main = "file:///proj/main.sd";
  const library = "file:///proj/shapes.sd";
  const functions = "file:///proj/functions.sd";
  const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
  documents.set({ textDocument: { uri: main, text: source, version: 1, languageId: "sparkdown" } });
  documents.set({ textDocument: { uri: library, text: foreign, version: 1, languageId: "sparkdown" } });
  if (third !== undefined) documents.set({ textDocument: { uri: functions, text: third, version: 1, languageId: "sparkdown" } });
  const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
  const document = documents.get(main)!;
  const tree = documents.tree(main)!;
  const uris = third === undefined ? [main, library] : [main, library, functions];
  if (reverse) uris.reverse();
  return (receiver: string) => (getCompletions(document, tree, getAnnotatedScripts(main, Object.fromEntries(uris.map((uri) => [uri, 1])), workspace), undefined, undefined, document.positionAt(source.indexOf(receiver) + receiver.length), undefined) ?? []).map((item) => item.label).sort();
}

const declarations = [
  "store Point = { old = 1 }\n",
  "define Point with\n  old = 1\nend\n",
];
const owner = "define ui as config with\n  own = 1\nend\n";
const foreignCases = [false, true].flatMap((reverse) => declarations.flatMap((declaration) =>
  ([["{ fresh = 1 }", ["fresh"]], ["1", []], ["unknown()", []]] as const).map(([value, expected]) => ({ reverse, declaration, value, expected }))));

describe("static member assignment identity", () => {
  test.each(foreignCases)("foreign initialization preserves procedural globals ($reverse, $declaration, $value)", ({ reverse, declaration, value, expected }) => {
    const request = requests(`function main()\n  Point = ${value}\n  local force = config.ui\n  return Point.\nend\n`, owner + declaration, reverse);
    expect.soft(request("Point.")).toEqual(expected);
    expect.soft(request("Point.")).toEqual(expected);
  });

  test.each(foreignCases)("foreign story-start aliases retain their table after rebinding ($reverse, $declaration, $value)", ({ reverse, declaration, value, expected: point }) => {
    for (const [receiver, expected] of [["alias.", ["old"]], ["Point.", point]] as const) {
      const source = `function main()\n  Point = ${value}\n  local force = config.ui\n  return ${receiver}\nend\n`;
      const request = requests(source, owner + declaration + "store alias = Point\n", reverse);
      expect.soft(request(receiver)).toEqual(expected);
      expect.soft(request(receiver)).toEqual(expected);
    }
  });

  test.each([false, true])("stored aliases share mutations regardless of declaration position (later=%s)", (later) => {
    for (const nested of [false, true]) {
      const table = nested ? "t.inner" : "t";
      const initial = nested ? "{ inner = {} }" : "{}";
      const alias = `store alias = ${table}\n`;
      const body = `function main()\n  ${table}.x = 1\n  return alias.\nend\n`;
      const source = `store t = ${initial}\n` + (later ? body + alias : alias + body);
      const request = requests(source, "", false);
      expect.soft(request("alias.")).toEqual(["x"]);
      expect.soft(request("alias.")).toEqual(["x"]);
    }
  });

  test("a cursor inside a stored function still traverses its local assignments", () => {
    const source = "store callback = function()\n  local t = {}\n  local alias = t\n  t.x = 1\n  return alias.@1\nend\n";
    expect(labelsAt(source)).toEqual(["x"]);
  });

  test.each([false, true])("lazy store methods retain story-start named functions through later rebinding (reverse=%s)", (reverse) => {
    for (const value of ["main", "helper"]) {
      for (const rebound of [false, true]) {
        const source = `function main()\n  ${rebound ? "main = 1\n  helper = unknown()\n  " : ""}handlers:\nend\nfunction helper() end\n`;
        const request = requests(source, `store handlers = { run = ${value} }\n`, reverse);
        expect.soft(request("handlers:")).toEqual(["run"]);
        expect.soft(request("handlers:")).toEqual(["run"]);
      }
    }
  });

  test.each([false, true])("same-file stores recognize named method values before or after declarations (later=%s)", (later) => {
    const table = "store handlers = { run = main }\n";
    const fn = "function main()\n  handlers:@1\nend\n";
    expect(labelsAt(later ? fn + table : table + fn)).toEqual(["run"]);
  });

  test.each([false, true])("a lazy foreign store recognizes its owner's named function (reverse=%s)", (reverse) => {
    const request = requests("function main()\n  handlers:\nend\n", "store handlers = { run = helper }\nfunction helper() end\n", reverse);
    expect(request("handlers:")).toEqual(["run"]);
    expect(request("handlers:")).toEqual(["run"]);
  });

  test.each([false, true])("a lazy store discovers a named function in a third script (reverse=%s)", (reverse) => {
    const request = requests("function main()\n  handlers:\nend\n", "store handlers = { run = action }\n", reverse, "function action(self)\n  return 7\nend\n");
    expect.soft(request("handlers:")).toEqual(["run"]);
    expect.soft(request("handlers:")).toEqual(["run"]);
  });

  test.each([false, true])("same-file stores recognize same-line marked functions before or after declarations (later=%s)", (later) => {
    const table = "store handlers = { run = action }\n";
    const fn = "& function action(self) return 7 end\n";
    expect(labelsAt((later ? table + fn : fn + table) + "function main()\n  handlers:@1\nend\n")).toEqual(["run"]);
  });

  test.each([false, true])("lazy stores recognize their owner's same-line marked function (reverse=%s)", (reverse) => {
    const request = requests("function main()\n  handlers:\nend\n", "store handlers = { run = action }\n& function action(self) return 7 end\n", reverse);
    expect.soft(request("handlers:")).toEqual(["run"]);
    expect.soft(request("handlers:")).toEqual(["run"]);
  });

  test.each([false, true])("lazy stores discover same-line marked functions in a third script (reverse=%s)", (reverse) => {
    const request = requests("function main()\n  handlers:\nend\n", "store handlers = { run = action }\n", reverse, "& function action(self) return 7 end\n");
    expect.soft(request("handlers:")).toEqual(["run"]);
    expect.soft(request("handlers:")).toEqual(["run"]);
  });

  test.each([false, true])("marked local and nested declarations stay unavailable as initial globals (reverse=%s)", (reverse) => {
    const third = "& local function localAction() end\nfunction other()\n  & function nestedAction() end\nend\n";
    const request = requests("function main()\n  handlers:\nend\n", "store handlers = { localAction = localAction, nested = nestedAction }\n", reverse, third);
    expect.soft(request("handlers:")).toEqual([]);
    expect.soft(request("handlers:")).toEqual([]);
  });

  test.each([false, true])("a third script's local, nested, conditional and define methods stay unavailable as initial globals (reverse=%s)", (reverse) => {
    const third = "local function localAction() end\nfunction other()\n  function nestedAction() end\n  if true then\n    function conditionalAction() end\n  end\nend\ndefine Point with\n  function method() end\nend\n";
    const request = requests("function main()\n  handlers:\nend\n", "store handlers = { localAction = localAction, nested = nestedAction, conditional = conditionalAction, method = method }\n", reverse, third);
    expect.soft(request("handlers:")).toEqual([]);
    expect.soft(request("handlers:")).toEqual([]);
  });

  test("named-function initialization borrows neither parameter nor sibling or define-method identities", () => {
    expect(labelsAt("function main(main)\n  local handlers = { run = main }\n  handlers:@1\nend\n")).toEqual([]);
    const source = "function other()\n  local function helper() end\n  if true then\n    function conditional() end\n  end\nend\ndefine Point with\n  function method() end\nend\nfunction main()\n  handlers:\nend\n";
    const request = requests(source, "store handlers = { sibling = helper, conditional = conditional, method = method }\n", false);
    expect(request("handlers:")).toEqual([]);
    expect(request("handlers:")).toEqual([]);
  });

  test.each([false, true])("multiple assignment captures local, global, nested and quoted receivers before writes (reverse=%s)", (reverse) => {
    for (const local of [false, true]) {
      for (const target of ["t.x", 't["x"]', "t.inner.x", 't["inner"]["x"]']) {
        const nested = target.includes("inner");
        const setup = `${local ? "local " : ""}t = { inner = {} }\n  local old = t\n`;
        const assignment = reverse ? `${target}, t = 1, { fresh = 1, inner = {} }` : `t, ${target} = { fresh = 1, inner = {} }, 1`;
        for (const [receiver, expected] of [[nested ? "old.inner" : "old", nested ? ["x"] : ["inner", "x"]], [nested ? "t.inner" : "t", nested ? [] : ["fresh", "inner"]]] as const) {
          const source = `function main()\n  ${setup}  ${assignment}\n  return ${receiver}.@1\nend\n`;
          expect.soft(labelsAt(source).sort()).toEqual(expected);
        }
      }
    }
  });
});
