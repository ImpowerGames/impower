// Sparkdown placements and precise ranges for #911's AST rules.
import { describe, expect, test } from "vitest";
import { diagnoseDetailed, diagnoseFilesDetailed } from "./diagnosticTestHarness";
import { testCompiler } from "../engineUnderTest";

const rules = new Set(["TableLiteral", "TableOperations", "DeprecatedApi"]);
const lints = (source: string) => diagnoseDetailed(source).filter((d) => rules.has(String(d.code)));

describe("table lints in Sparkdown", () => {
  test("lexical member writes do not replace the global builtin", () => {
    expect(lints('function replace()\nlocal string = {}\nstring.find = function() return 1 end\nend\nfunction run()\nlocal t = {}\ntable.insert(t, string.find("hello", "h"))\nend\n').map((d) => d.code)).toEqual(["TableOperations"]);
  });

  test("cached candidates follow added, edited and removed included overrides", () => {
    const compiler = testCompiler();
    const main = { uri: "inmemory:///main.sd", type: "script" as const, name: "main", ext: "sd", version: 1, languageId: "sparkdown",
      text: 'include override.sd\nfunction run()\nlocal t = {}\ntable.insert(t, string.find("hello", "h"))\ntable.insert(t, 0, 42)\ngetfenv(1)\nend\n' };
    const override = (text: string, version: number) => ({ ...main, uri: "inmemory:///override.sd", name: "override", text, version });
    const compile = () => Object.values(compiler.compile({ textDocument: { uri: main.uri } }).program.diagnostics ?? {}).flat()
      .filter((d) => rules.has(String(d.code))).map((d) => d.code);
    compiler.configure({ files: [main] });
    expect(compile()).toEqual(["TableOperations", "TableOperations", "DeprecatedApi"]);
    const tree = compiler.documents.tree(main.uri);
    const replacement = override("function replace()\nstring.find = function() return 1 end\nend\n", 1);
    compiler.addFile({ file: replacement });
    expect(compile()).toEqual(["TableOperations", "DeprecatedApi"]);
    expect(compiler.documents.tree(main.uri) === tree).toBe(true);
    compiler.updateDocument({ textDocument: { uri: "inmemory:///override.sd", version: 2 }, contentChanges: [{ text: "Ready.\n" }] });
    expect(compile()).toEqual(["TableOperations", "TableOperations", "DeprecatedApi"]);
    compiler.updateDocument({ textDocument: { uri: "inmemory:///override.sd", version: 3 }, contentChanges: [{ text: "function replace()\nstring = {}\nend\n" }] });
    expect(compile()).toEqual(["TableOperations", "DeprecatedApi"]);
    compiler.removeFile({ file: replacement });
    expect(compile()).toEqual(["TableOperations", "TableOperations", "DeprecatedApi"]);
    expect(compiler.documents.tree(main.uri) === tree).toBe(true);
  });

  test.each([
    "string = { find = function() return 1 end }",
    "string.find = function() return 1 end",
    'string["find"] = function() return 1 end',
    "function string.find() return 1 end",
  ])("explicit builtin replacement: %s", (replacement) => {
    expect(lints(`function run()\n${replacement}\nlocal t = {}\ntable.insert(t, string.find("hello", "h"))\nend\n`)).toEqual([]);
  });

  test("included-script overrides suppress only the multi-result assumption", () => {
    const warnings = diagnoseFilesDetailed({
      "main.sd": 'include override.sd\nfunction run()\nlocal t = {}\ntable.insert(t, string.find("hello", "h"))\ntable.insert(t, 0, 42)\nend\n',
      "override.sd": "function replace()\nstring.find = function() return 1 end\nend\n",
    }).filter((d) => rules.has(String(d.code)));
    expect(warnings.map((d) => d.message)).toEqual([
      "table.insert uses index 0 but arrays are 1-based; did you mean 1 instead?",
    ]);
  });

  test.each([
    ["store initializer", "store t = { first = 1, first = 2 }\nReady.\n"],
    ["define property", "define hero as character with\n  value = { first = 1, first = 2 }\nend\nReady.\n"],
    ["table inside interpolation", "Hi {tostring({ first = 1, first = 2 })}.\n"],
    ["Sparkle handler body", 'layout main with\n  button "Check" @click={ local t = { first = 1, first = 2 }; print(t) }\nend\nReady.\n'],
  ])("%s", (_placement, source) => {
    const warnings = lints(source);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe("TableLiteral");
    expect(warnings[0]!.message).toContain("Table field 'first' is a duplicate;");
  });

  test("nested literals report each duplicate once", () => {
    expect(lints("function run()\nlocal _t = { outer = { a = 1, a = 2 }, outer = 3 }\nend\n").map((d) => d.message)).toEqual([
      "Table field 'a' is a duplicate; previously defined at line 2",
      "Table field 'outer' is a duplicate; previously defined at line 2",
    ]);
  });

  test("only supported literal keys are compared", () => {
    expect(lints(`function run()
local _t = { [1.5] = 1, [1.5] = 2, [-1] = 1, [-1] = 2,
  [("x")] = 1, [("x")] = 2, [2147483648] = 1, [2147483648] = 2 }
end
`)).toEqual([]);
  });

  test("disjoint read/write fields are allowed but overlapping access is reported", () => {
    expect(lints(`function run()
type Valid = { read a: number, write a: string }
type Invalid = { a: number, read a: string }
end
`).map((d) => d.message)).toEqual([
      "Table type field 'a' is already read-write; previously defined at line 3",
    ]);
  });

  test("diagnostics point at the duplicate key and suspicious argument", () => {
    const warnings = lints("function run()\nlocal t = { a = 1, a = 2 }\ntable.insert(t, 0, 42)\nend\n");
    expect(warnings.map((d) => ({ code: d.code, range: d.range }))).toEqual([
      { code: "TableLiteral", range: { start: { line: 1, character: 19 }, end: { line: 1, character: 20 } } },
      { code: "TableOperations", range: { start: { line: 2, character: 16 }, end: { line: 2, character: 17 } } },
    ]);
  });
});
