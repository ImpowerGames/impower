// A store's value list with two values and no comma between them, and a
// story local with no name or a trailing comma in its name list, report the
// errors Luau reports, once each, in Luau's words at Luau's tokens (I-1407,
// after I-1370). Valid lists report nothing.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const SCENE = "scene start\n  Hello.\nend\n";

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters, in position order. */
function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

/** The official parser's errors for a line, moved down `line` lines and right `indent` characters. */
function official(text: string, line = 0, indent = 0): string[] {
  return officialErrorList(`${text}\n`)
    .map((e) =>
      e.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, l1, c1, l2, c2) => `${+l1 + line}:${+c1 + indent}-${+l2 + line}:${+c2 + indent}`),
    )
    .sort();
}

describe("a store's value list and a story local's name list report Luau's errors (I-1407)", () => {
  // The tree ends the store before the value with no comma before it, and
  // reads the rest of the line as story.
  const stores = ["store a, b = 1 2", "store a = 1 2", "store a, b, c = 1, 2 3", "store t = {1, 2} 3", "store a = 1 Hello", "store a, = 1 2"];
  for (const line of stores) {
    const expected = official(line.replace(/^store/, "local"));
    test(`${JSON.stringify(line)} before a scene`, () => {
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`${line}\n${SCENE}`)).toEqual(expected);
    });
    test(`${JSON.stringify(line)} ending the document`, () => {
      expect(sparkdownErrors(`${line}\n`)).toEqual(expected);
    });
    // The reading of the rest of the line reaches the document's end.
    test(`${JSON.stringify(line)} with no line break after it`, () => {
      expect(sparkdownErrors(line)).toEqual(expected);
    });
    test(`${JSON.stringify(line)} in a scene`, () => {
      expect(sparkdownErrors(`scene start\n  ${line}\n  Hello.\nend\n`)).toEqual(official(line.replace(/^store/, "local"), 1, 2));
    });
  }

  // The tree reads the declaration's names and assignment however few
  // names it holds.
  const locals = ["local = 1", "local a, = 1", "local a, b, = 1, 2", "local , = 1", "local a,, = 1", "local a: number, = 1"];
  for (const line of locals) {
    test(`${JSON.stringify(line)} in a scene`, () => {
      const expected = official(line, 1, 2);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`scene start\n  ${line}\n  Hello.\nend\n`)).toEqual(expected);
    });
    test(`${JSON.stringify(line)} before a scene`, () => {
      expect(sparkdownErrors(`${line}\n${SCENE}`)).toEqual(official(line));
    });
  }

  test("the ticket's errors, at the ticket's tokens", () => {
    expect(sparkdownErrors(`store a, b = 1 2\n${SCENE}`)).toEqual(["0:15-0:16 Expected identifier when parsing expression, got '2'"]);
    expect(sparkdownErrors("scene start\n  local = 1\n  Hello.\nend\n")).toEqual([
      "1:8-1:9 Expected identifier when parsing variable name, got '='",
    ]);
    expect(sparkdownErrors("scene start\n  local a, = 1\n  Hello.\nend\n")).toEqual([
      "1:11-1:12 Expected identifier when parsing variable name, got '='",
    ]);
  });

  // A name missing at the line's end keeps Sparkdown's own report.
  test.each([
    ["scene start\n  local a,\n  Hello.\nend\n", ["1:9-1:10 Expected identifier when parsing variable name, got <eof>"]],
    [`store a,\n${SCENE}`, ["0:7-0:8 Expected identifier when parsing variable name, got <eof>"]],
    ["local a,", ["0:7-0:8 Expected identifier when parsing variable name, got <eof>"]],
  ])("%j keeps its report", (text, expected) => {
    expect(sparkdownErrors(text)).toEqual(expected);
  });

  // A scene's `end` right after a store on its line closes the scene, and
  // the store's reading stops before it (round 1).
  test.each(["scene start\n  store a = 1 end\n", "scene start\n  store a = 1 end", "scene start\n  store a, b = 1, 2 end\n"])(
    "%j reports nothing at the scene's end",
    (text) => {
      expect(sparkdownErrors(text)).toEqual([]);
    },
  );

  // After story on the store's line, the tree reads an `end` as story too,
  // and the line reports what Luau reports for it.
  test.each(["store a = 1 2 end", "store a, b = 1 Hello end"])("%j in a scene reads its end as story", (line) => {
    const expected = official(line.replace(/^store/, "local"), 1, 2);
    expect(expected.some((e) => e.includes("got 'end'")), "the official parser reports the end").toBe(true);
    expect(sparkdownErrors(`scene start\n  ${line}\n`)).toEqual(expected);
  });

  test.each([
    `store a, b = 1, 2\n${SCENE}`,
    `store a = 1\n${SCENE}`,
    `store a = 1 -- note\n${SCENE}`,
    "store a = 1",
    "scene start\n  local a, b = 1, 2\n  Hello.\nend\n",
    "scene start\n  local a = 1\n  Hello.\nend\n",
    "scene start\n  local a: number, b = 1, 2\n  Hello.\nend\n",
  ])("%j reports nothing", (text) => {
    expect(sparkdownErrors(text)).toEqual([]);
  });
});
