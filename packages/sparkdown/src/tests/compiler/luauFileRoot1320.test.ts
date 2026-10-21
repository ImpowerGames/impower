// A `.luau` file parses as Luau from its first line (I-1320, closing I-732
// and I-1385): its top level is a pure-Luau block body, so a `local` list
// continues after a trailing comma, a call is a statement rather than an
// action line, and a line that reads like a Sparkdown construct (`define`,
// `store`, `layout`, `->`) gets the errors the official parser reports.
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

/** The names of the nodes of a document's tree as the compiler parses it. */
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

  // The lints read the `.luau` file's own tree as Luau reads it too: a
  // top-level `;` separates two statements, so the second one on the line
  // is not reported as missing one.
  test("a statement after a top-level semicolon is not reported as on the same line", () => {
    const { errorMessages, warningMessages } = collectDiagnostics("local a; b = 1, 2\nprint(a, b)\n", "inmemory:///util.luau");
    expect(errorMessages).toEqual([]);
    expect(warningMessages.filter((m) => m.includes("A new statement is on the same line"))).toEqual([]);
  });

  // A `.luau` file is a Luau chunk, whose top level may return; a script's
  // top level is story, where a return is an error.
  test("a return at a .luau file's top level is no error", () => {
    for (const source of ["local x = 1\nreturn x\n", "return\n"]) {
      expect(collectDiagnostics(source, "inmemory:///util.luau").errorMessages, JSON.stringify(source)).toEqual([]);
    }
  });

  test("a marked return at a .sd script's top level is still reported", () => {
    expect(collectDiagnostics("& return 1\n", "inmemory:///main.sd").errorMessages).toEqual([
      "Return statements can only be used inside a function body — found one at file scope.",
    ]);
  });

  test("the same text in a .sd script is still read as story after the declaration", () => {
    expect(nodeNames("inmemory:///main.sd", CONTINUED)).toContain("ImplicitAction");
  });
});

// A `.luau` file's tree, as the `.luau` root reads it, and its scopes, which
// VS Code's grammar for the `sparkdown-luau` language gives every character
// as the tree does.
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

// The forms of I-1385's table: in a `.luau` file each is Luau's, and its
// errors are the official parser's, no more and no fewer, each at its range.
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
