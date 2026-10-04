import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getCompletions } from "../../utils/providers/getCompletions";
import { getAnnotatedScripts } from "../../utils/annotations/getAnnotatedScripts";

function requests(source: string, foreign: string, reverse: boolean) {
  const main = "file:///proj/main.sd";
  const library = "file:///proj/shapes.sd";
  const documents = new SparkdownDocumentRegistry(["declarations", "references"]);
  documents.set({ textDocument: { uri: main, text: source, version: 1, languageId: "sparkdown" } });
  documents.set({ textDocument: { uri: library, text: foreign, version: 1, languageId: "sparkdown" } });
  const workspace = { document: (uri: string) => documents.get(uri), tree: (uri: string) => documents.tree(uri), annotations: (uri: string) => documents.annotations(uri) };
  const document = documents.get(main)!;
  const tree = documents.tree(main)!;
  const uris = reverse ? [library, main] : [main, library];
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
