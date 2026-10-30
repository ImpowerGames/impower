import { describe, expect, test } from "vitest";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { collectDiagnostics } from "../runtime/runtimeTestHarness";
import { diagnoseFilesDetailed } from "../luau-conformance/diagnosticTestHarness";
import { testCompiler } from "../engineUnderTest";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { stripAnsi } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

function nodeNames(uri: string, text: string): string[] {
  const compiler = testCompiler();
  compiler.configure({
    files: [{ uri, type: "script", name: "util", ext: "luau", text, version: 1, languageId: "sparkdown" }],
  });
  const names: string[] = [];
  compiler.documents.tree(uri)!.iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

const CONTINUED = "local a, b = 1,\n  2\nprint(b)\n";

describe("a .luau file's top level is Luau (I-732)", () => {
  test("a local list continued after a trailing comma compiles with no diagnostics", () => {
    expect(collectDiagnostics(CONTINUED, "inmemory:///util.luau")).toEqual({ errorMessages: [], warningMessages: [] });
  });

  test("the one-line form compiles with no diagnostics", () => {
    expect(collectDiagnostics("local a, b = 1, 2\nprint(b)\n", "inmemory:///util.luau")).toEqual({
      errorMessages: [],
      warningMessages: [],
    });
  });

  test("the list is a Luau definition and the call a statement, not an action line", () => {
    const names = nodeNames("inmemory:///util.luau", CONTINUED);
    expect(names).toContain("LuauVariableDefinition");
    expect(names).toContain("LuauAccessPath");
    expect(names).not.toContain("LuauSparkdownVariableDefinition");
    expect(names).not.toContain("ImplicitAction");
  });

  test("a statement after a top-level semicolon is not reported as on the same line", () => {
    const { errorMessages, warningMessages } = collectDiagnostics("local a; b = 1, 2\nprint(a, b)\n", "inmemory:///util.luau");
    expect(errorMessages).toEqual([]);
    expect(warningMessages.filter((m) => m.includes("A new statement is on the same line"))).toEqual([]);
  });

  test("a return at a .luau file's top level is no error", () => {
    for (const source of ["local x = 1\nreturn x\n", "return\n"]) {
      expect(collectDiagnostics(source, "inmemory:///util.luau").errorMessages, JSON.stringify(source)).toEqual([]);
    }
  });

  test("a marked return in a scene of a .sd script is still reported", () => {
    expect(collectDiagnostics("scene start\n  & return 1\nend\n", "inmemory:///main.sd").errorMessages).toEqual([
      "Return statements can only be used inside a function body — found one in scene 'start'.",
    ]);
  });

  test("the same text in a .sd script is still read as story after the declaration", () => {
    expect(nodeNames("inmemory:///main.sd", CONTINUED)).toContain("ImplicitAction");
  });
});

describe("the .luau root's tree and scopes", () => {
  const LUAU_FILE = [
    "--!strict",
    "local a, b = 1,",
    "  2",
    "print(b)",
    "@native",
    "local function add(x: number, y: number): number",
    "  return x + y",
    "end",
    "define X with",
    "store x = 1",
    "-> start",
    "end",
    "",
  ].join("\n");

  test("the tree", () => {
    const tree = createSparkdownParser("inmemory:///util.luau").parse(LUAU_FILE);
    expect(stripAnsi(printTree(tree, LUAU_FILE))).toMatchSnapshot();
  });

  for (const source of [LUAU_FILE, CONTINUED, "layout main with\nend\n", "if x then\n  y()\nelse\n  z()\nend\n"]) {
    test(`VS Code's scopes are the tree's: ${JSON.stringify(source.slice(0, 24))}`, async () => {
      const comparison = await compareEnginesFull(source, { luauFile: true });
      expect(comparison.divergences, formatDivergences(comparison.source, comparison.divergences)).toEqual([]);
    });
  }
});

describe("a .luau file's Sparkdown-looking lines get the official parser's errors (I-1385)", () => {
  const errorsIn = (sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.file === "snippet.luau" && d.severity === DiagnosticSeverity.Error)
      .map(({ range, message }) => `${range!.start.line}:${range!.start.character}-${range!.end.line}:${range!.end.character} ${message}`)
      .sort();
  for (const snippet of ["define X with\nend\n", "define X with\n", "store x = 1\n", "-> start\n", "layout main with\nend\n"]) {
    test(JSON.stringify(snippet), () => {
      const official = officialErrorList(snippet, { luauFile: true }).sort();
      expect(official.length).toBeGreaterThan(0);
      expect(errorsIn({ "snippet.luau": snippet })).toEqual(official);
      expect(errorsIn({ "main.sd": 'run "snippet"\n', "snippet.luau": snippet }), "through a `run`").toEqual(official);
    });
  }
});
