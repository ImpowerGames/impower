// A `::` type assertion written directly after an unparenthesized function
// literal at story scope is part of the declaration, as Luau reads it
// (`simpleexp :: type`, I-1364): a `local`, `store` or `const` value, one
// of several values, a value after an annotation, a function spanning lines
// and a table field's function. A `local` is written in a scene body and a
// `store` or `const` at the top level, each a story statement. The
// declaration runs to the line's end in both TextMate engines, the official parser reports nothing, the compiled
// program reports nothing, the story prints the line after it, and an
// incremental compile reports what a cold one does.
import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
// The story enters the scene that holds a `local` form, or that follows a
// `store` or `const` form, and prints the form's use of `w` there.
const SCENE = "-> start\nscene start\n";
const NEXT = "\nlocal w = 5\n";

/** `form` with each of its lines indented as a scene body's. */
function inScene(form: string): string {
  return form.replace(/^/gm, "  ");
}

/** The story that declares `form` and prints `use` on the line after it. */
function storyOf(form: string, use: string): { text: string; declaration: string } {
  const body = `  local w = 5\n  Value {${use}}.\nend\n`;
  if (/^(?:store|const)\b/.test(form)) return { text: `${form}\n${SCENE}${body}`, declaration: form };
  const declaration = inScene(form);
  return { text: `${SCENE}${declaration}\n${body}`, declaration };
}

/** Every diagnostic, as `start-end message` in 0-based lines and characters, sorted. */
function diagnosticsOf(compiler: SparkdownCompiler): string[] {
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

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
    expect(diagnosticsOf(compiler), `after ${JSON.stringify(insert)}`).toEqual(diagnosticsOf(newCompiler(edited)));
  }
}

/** The top-level nodes of `text` that are not line breaks. */
function topLevel(text: string): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  for (let node = parseSource(text).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "Newline") nodes.push(node);
  }
  return nodes;
}

/** Whether `node` holds a type assertion. */
function holdsCast(node: SyntaxNode): boolean {
  const cursor = node.cursor();
  do {
    if (cursor.from >= node.to) return false;
    if (/TypeCastOperation$/.test(cursor.name)) return true;
  } while (cursor.next());
  return false;
}

// [form, the story's use of what it declares]. Each form is one declaration,
// written in the story as `storyOf` places it; the Luau the official parser
// reads is the form with `store` or `const` written as `local`, followed by
// `NEXT`.
const FORMS: Record<string, [form: string, use: string][]> = {
  "a declaration's value": [
    ["local id = function(x) return x end :: () -> number", "id(w)"],
    ["local id = function(x) return x end :: any", "id(w)"],
    ["local id = function(x) return x end  ::  any", "id(w)"],
    ["local id = function(x) return x end :: (number) -> number", "id(w)"],
    ["local id = function(x) return x end :: any --[[c]]", "id(w)"],
    ["local id = function(x) return x end :: any -- c", "id(w)"],
    ["local id = function(x)\n  return x\nend :: any", "id(w)"],
    ["local id: any = function(x) return x end :: any", "id(w)"],
    ["local id, z = function(x) return x end :: any, 1", "id(w)"],
    ["local z, id = 1, function(x) return x end :: any", "id(w)"],
    ["local id = function(x): number return x end :: any", "id(w)"],
  ],
  "a store or const value": [
    ["store id = function(x) return x end :: any", "id(w)"],
    ["store id = function(x) return x end :: () -> number", "id(w)"],
    ["const id = function(x) return x end :: any", "id(w)"],
  ],
  "a table field's function": [
    ["local t = { f = function(x) return x end :: any }", "t.f(w)"],
    ["local t = { function(x) return x end :: any }", "t[1](w)"],
    ["store t = { f = function(x) return x end :: () -> number }", "t.f(w)"],
  ],
  // Controls that read correctly before the fix.
  controls: [
    ["local id = (function(x) return x end) :: () -> number", "id(w)"],
    ["local id = function(x) return x end::any", "id(w)"],
    ["local id = function(x) return x end", "id(w)"],
    ["local id = function(x) return x end -- c", "id(w)"],
  ],
};

describe("a type assertion after an unparenthesized function literal at story scope (I-1364)", () => {
  for (const [group, forms] of Object.entries(FORMS)) {
    describe(group, () => {
      for (const [form, use] of forms) {
        const { text, declaration: written } = storyOf(form, use);
        const luau = `${form.replace(/^(?:store|const)\b/, "local")}${NEXT}`;

        test(`${JSON.stringify(form)}: the declaration holds the line`, () => {
          const tree = stripAnsi(dumpTree(text));
          const from = text.indexOf(written);
          const declaration = topLevel(text).find((node) => node.from === from);
          expect([declaration?.name, declaration?.from, declaration?.to], tree).toEqual([
            "LuauSparkdownVariableDefinition",
            from,
            from + written.length,
          ]);
          if (form.includes("::")) expect(holdsCast(declaration!), tree).toBe(true);
        });

        test(`${JSON.stringify(form)}: engines agree`, async () => {
          const result = await compareEnginesFull(text);
          expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
        });

        test(`${JSON.stringify(form)}: the official parser and the compiler report nothing`, () => {
          expect(officialErrorList(luau)).toEqual([]);
          expect(diagnosticsOf(newCompiler(text))).toEqual([]);
        });

        test(`${JSON.stringify(form)}: the story prints the line after it`, () => {
          const ctx = makeRuntimeStoryFromSource(text);
          const errors = [...ctx.errorMessages];
          ctx.story.onError = (message: string) => void errors.push(message);
          expect(ctx.story.Continue()).toBe("Value 5.\n");
          expect(errors).toEqual([]);
        });

        test(`${JSON.stringify(form)}: an incremental compile reports what a cold one does`, () => {
          expectIncrementalEqualsCold(text);
        });
      }
    });
  }
});

// A function's `end` takes the whitespace before a `::` wherever it stands,
// so the same forms in a function body, and a function statement that a
// stray `::` follows, still read as Luau reads them: Sparkdown reports the
// official parser's syntax errors, message and range, for the function.
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const BODY_FORMS = [
  "local id = function(x) return x end :: () -> number\n  return id",
  "local id = function(x) return x end  ::  any\n  return id",
  "local id = function(x)\n    return x\n  end :: any\n  return id",
  "return function(x) return x end :: any",
  "local t = { f = function(x) return x end :: any }\n  return t",
  "local function g() end :: any",
  "function g() end :: any",
  "do end :: any",
];

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters, sorted. */
function sparkdownSyntaxErrors(text: string): string[] {
  return (newCompiler(text).compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

describe("a function's end before a `::` in a function body", () => {
  for (const form of BODY_FORMS) {
    const luau = `${HEADER}${form}${FOOTER}`;
    const text = `${luau}After {run()}.\n`;
    test(`${JSON.stringify(form)}: engines agree`, async () => {
      const result = await compareEnginesFull(text);
      expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
    });
    test(`${JSON.stringify(form)}: Luau's errors at Luau's ranges`, () => {
      expect(sparkdownSyntaxErrors(text)).toEqual([...officialErrorList(luau)].sort());
    });
  }
});
