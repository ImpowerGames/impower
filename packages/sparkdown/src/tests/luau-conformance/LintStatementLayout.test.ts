import { describe, expect, test } from "vitest";
import { diagnose, diagnoseDetailed, diagnoseWithLints, lintMessagesInFunction } from "./diagnosticTestHarness";
import { getParser } from "../compiler/grammarSnapshot";
import { readLuauStatements } from "../../compiler/typecheck/readLuauAst";

const SAME_LINE = "A new statement is on the same line; add semi-colon on previous statement to silence";
const MULTI_LINE = "Statement spans multiple lines; use indentation to silence";

function layout(source: string) {
  return diagnoseDetailed(source).filter((d) => d.code === "SameLineStatement" || d.code === "MultiLineStatement");
}

describe("statement layout diagnostics", () => {
  test("parser helpers omit only unrelated rules while full lint helpers retain layout warnings", () => {
    const source = "function f()\n local x = 1 print(2)\nend\n";
    expect(diagnose(source)).toEqual([]);
    expect(diagnoseWithLints(source)).toContain(SAME_LINE);
    expect(lintMessagesInFunction("\n local x = 1 print(2)\n", "LocalUnused")).toEqual([
      "Variable 'x' is never used; prefix with '_' to silence",
    ]);
    expect(lintMessagesInFunction("\n local x = 1 print(2)\n")).toContain(SAME_LINE);
    expect(diagnose("function f()\n print(\nend\n")).not.toEqual([]);
  });

  test("same-line warnings use the upstream code and second statement's range, once per line", () => {
    expect(layout("function f()\n  print(1) print(2) print(3)\nend\n")).toEqual([{
      file: "main.sd", code: "SameLineStatement", severity: 2, message: SAME_LINE,
      range: { start: { line: 1, character: 11 }, end: { line: 1, character: 19 } },
    }]);
  });

  test("continuation warnings point to the first unindented expression, once per statement", () => {
    expect(layout("function f()\n  print(math.max(1,\n  2,\n  3))\nend\n")).toEqual([{
      file: "main.sd", code: "MultiLineStatement", severity: 2, message: MULTI_LINE,
      range: { start: { line: 2, character: 2 }, end: { line: 2, character: 3 } },
    }]);
  });

  test.each([
    "function f()\n  print(math.max(1,\n    2))\nend\n",
    "function f()\n  local _t = {\n  1,\n  2\n  }\nend\n",
    "function f()\n  repeat\n    print(1)\n  until math.max(1,\n  2) > 0\nend\n",
    "Narrative print(1) print(2)\nSecond narrative line\n",
    "function f()\n  print(1) print(\nend\n",
    "function f()\n  if true then\n    print(1) print(2)\nend\n",
  ])("does not report indentation, exemptions, narrative or incomplete syntax: %s", (source) => {
    expect(layout(source)).toEqual([]);
  });

  test("same-line statements inside a table's function are still checked", () => {
    expect(layout("function f()\n local _t = {function() print(1) print(2) end}\nend\n").map((d) => d.code)).toEqual(["SameLineStatement"]);
  });

  test("separate function interpolations share the once-per-document-line limit", () => {
    expect(layout("Text {(function() print(1) print(2) end)()} {(function() print(3) print(4) end)()}\n").map((d) => d.code)).toEqual(["SameLineStatement"]);
  });

  test("separate explicit logic statements on narrative lines retain document positions", () => {
    expect(layout("Narrative\n& print(1); print(2)\nMore narrative\n& print(3) print(4)\n").map((d) => ({ code: d.code, line: d.range?.start.line }))).toEqual([
      { code: "SameLineStatement", line: 3 },
    ]);
  });

  test.each([
    "& do print(1) print(2) end\n",
    "layout main with\n button @click={ print(1) print(2) }\nend\n",
  ])("checks statements in bounded islands and cached handler roots: %s", (source) => {
    expect(layout(source).map((d) => d.code)).toEqual(["SameLineStatement"]);
  });

  test("keeps malformed bounded syntax errors without layout warnings", () => {
    const source = "& do print(1) print( end\n";
    const diagnostics = diagnoseDetailed(source);
    expect(diagnostics.some((d) => d.severity === 1)).toBe(true);
    expect(layout(source)).toEqual([]);
  });

  test("leaves a malformed handler's converter error boundary alone", () => {
    const source = "layout main with\n button @click={ print(1) print( }\nend\n";
    const tree = getParser().parse(source);
    let errors = 0;
    tree.iterate({ enter(node) {
      if (node.name !== "LuauSparkleHandlerClosure") return;
      const content = node.node.getChild("LuauSparkleHandlerClosure_content");
      if (content) errors += readLuauStatements([content], source).errors.length;
    } });
    expect(errors).toBeGreaterThan(0);
    expect(layout(source)).toEqual([]);
  });
});
