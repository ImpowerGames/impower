// A call written after a `;` on a line of a `define` body is a statement of
// the body, not a method's header: a method header begins only where its line
// starts (I-1506). The define keeps its `end`, the call's errors are what the
// official parser reports for the body's statements in a `do` block, and a
// `name(` at the start of a line keeps its method-versus-call reading
// (I-1454). Both TextMate engines read each form alike, and an incremental
// compile reports what a cold one does.
import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { isDefineMethodCall } from "../../compiler/utils/defineMethodCall";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

/** Every error, as `start-end message` in 0-based lines and characters, sorted. */
function errorsOf(compiler: SparkdownCompiler): string[] {
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error)
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

const errors = (text: string) => errorsOf(newCompiler(text));

/** The official errors of a define body's statements, written in a `do` block in place of the define's header. */
const official = (body: string) => officialErrorList(`do\n${body}end\n`).sort();

/** The position of `offset` in `text`, as an LSP position. */
function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from the form, on a line before it, and changes no line count.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
    [padded.indexOf("local p"), 0, "    "],
  ] as const) {
    const compiler = newCompiler(padded);
    compiler.compile({ textDocument: { uri: URI } } as never);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: positionAt(padded, offset), end: positionAt(padded, offset + removed) }, text: insert }],
    } as never);
    const edited = padded.slice(0, offset) + insert + padded.slice(offset + removed);
    expect(errorsOf(compiler), `after ${JSON.stringify(insert)}`).toEqual(errorsOf(newCompiler(edited)));
  }
}

/** The names of the nodes of `text`'s tree. */
function nodeNames(text: string): string[] {
  const names: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  do names.push(cursor.name);
  while (cursor.next());
  return names;
}

/** The `LuauMethodDefinition` nodes of `text`, each as `name:method` or `name:call`. */
function methodReadings(text: string): string[] {
  const readings: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  do {
    if (cursor.name !== "LuauMethodDefinition") continue;
    const node: SyntaxNode = cursor.node;
    const name = node.getChild("LuauMethodDefinition_begin");
    const header = text.slice(name?.from ?? node.from, name?.to ?? node.from).trim();
    readings.push(`${header}:${isDefineMethodCall(node, (pos) => text.slice(0, pos).split("\n").length - 1) ? "call" : "method"}`);
  } while (cursor.next());
  return readings;
}

const STORY = "Hello.\n";

// [the define's statements, the methods after them, the method readings].
// They stand between `define X with` and the define's own `end`, which a
// story line follows; the errors are the official parser's for the
// statements, and the well-formed methods report nothing.
const FORMS: [statements: string, methods: string, readings: string[]][] = [
  // The ticket's form: a call after a property and a `;`.
  ["  y = 1; print(1 2 3)\n", "", []],
  // After two properties.
  ["  y = 1; z = 2; print(1 2 3)\n", "", []],
  // A call nested in the call's arguments.
  ["  y = 1; print(f(1 2))\n", "", []],
  // A call in the property's value, and another after the `;` (comment
  // 6354736903 on I-1506).
  ["  y = print(1 2); print(3 4)\n", "", []],
  // A call Luau reads, after a `;`, and a line below it.
  ["  y = 1; print(1)\n  z = 2\n", "", []],
  // A call after a `;`, with a method below it.
  ["  y = 1; print(1 2)\n", "  g()\n    return 1\n  end\n", ["g:method"]],
  // Controls: a method header at the line's start, and a call line.
  ["", "  f()\n    x = 1\n  end\n", ["f:method"]],
  ["  print(1 2)\n  y = 2\n", "", ["print:call"]],
];

describe("a call after a `;` in a define body is a statement of the body (I-1506)", () => {
  for (const [statements, methods, readings] of FORMS) {
    const body = statements + methods;
    const text = `define X with\n${body}end\n${STORY}`;
    test(`${JSON.stringify(body)}: the official parser's errors for the statements`, () => {
      expect(errors(text), stripAnsi(dumpTree(text))).toEqual(official(statements));
    });
    test(`${JSON.stringify(body)}: the define keeps its end`, () => {
      expect(nodeNames(text), stripAnsi(dumpTree(text))).toContain("LuauDefine_end");
    });
    test(`${JSON.stringify(body)}: the method reading`, () => {
      expect(methodReadings(text)).toEqual(readings);
    });
    test(`${JSON.stringify(body)}: engines agree`, async () => {
      const result = await compareEnginesFull(text);
      expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
    });
    test(`${JSON.stringify(body)}: an incremental compile reports what a cold one does`, () => {
      expectIncrementalEqualsCold(text);
    });
  }
  test("the ticket's form reports Luau's three errors", () => {
    expect(official("  y = 1; print(1 2 3)\n").length, "the official parser reports the form").toBe(3);
  });
});
