import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseSource, dumpTree, stripAnsi } from "./grammarSnapshot";
import { compareEnginesFull, treeScopeStackAt } from "./scopeEquality";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const definitions = [
  "define proof1374 as color with value = \"#13171f\" end",
  "style proof1374 with end",
  "animation proof1374 with end",
  "theme proof1374 with end",
  "morph proof1374 with end",
  "layout proof1374 with end",
  "component proof1374(title) with end",
  "screen proof1374 with end",
];
function compile(text: string) {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] } as never);
  const program = compiler.compile({ textDocument: { uri } } as never).program;
  const diagnostics = Object.values(program.diagnostics ?? {}).flat().filter(d => d.severity === 1);
  const errors = diagnostics.map(d => typeof d.message === "string" ? d.message : d.message.value);
  return { context: program.context, errors, diagnostics };
}

describe("finite structured story captures (#1374)", () => {
  test("a nonempty marked define retains trailing statements and trivia", async () => {
    for (const newline of ["\n", "\r\n"]) {
      const source = ["store count = 0", "  & define proof1374 with x = 1 end count += 1 --[[same line]]", "Value {count}.", ""].join(newline);
      const runtime = makeRuntimeStoryFromSource(source);
      expect(runtime.errorMessages).toEqual([]);
      expect(runtime.story.ContinueMaximally()).toBe("Value 1.\n");
      expect((await compareEnginesFull(source)).divergences).toEqual([]);
    }
  });
  test.each(definitions)("preserves complete one-line definition %s", async definition => {
    const source = `& ${definition}\nFollowing.\n`;
    const marked = compile(source);
    const keyword = definition.split(" ")[0]!;
    const category = keyword === "define" ? "color" : keyword;
    const name = definition.split(" ")[1]!.split("(")[0]!;
    const parity = await compareEnginesFull(source);
    console.log("1374 SAME-MARKED", JSON.stringify({ definition, errors: marked.errors, ranges: marked.diagnostics.map(d => d.range), definitionOutput: (marked.context as any)[category]?.[name] ?? null, incomplete: stripAnsi(dumpTree(source)).includes("ERROR_INCOMPLETE"), divergences: parity.divergences.length }));
    // The baseline does not emit marked structured definitions. Preserve that
    // existing limitation; enabling them is separate language behavior.
    expect((marked.context as any)[category]?.[name]).toBeUndefined();
    const emptyMarkError = "Expected identifier when parsing expression, got <eof>";
    expect(marked.errors).toEqual(keyword === "define" ? [] : keyword === "morph" ? [
      "A morph needs at least two keyframes to move between.",
      "`method` is required when `blend = morph`. Choose `match`, `bend` or `trace`.",
      emptyMarkError,
    ] : [emptyMarkError]);
    expect(stripAnsi(dumpTree(source))).not.toContain("ERROR_INCOMPLETE");
    expect(parity.divergences).toEqual([]);
  });

  test.each(["define", "style", "layout", "screen", "component", "animation", "theme", "morph"])("bounds unfinished %s and nested opaque children", async keyword => {
    const results: unknown[] = [];
    for (const newline of ["\n", "\r\n"]) for (const suffix of ["", " --[[", " value = [[", " value = \"{f(", " value = `{"]) {
      const line = `& ${keyword} Example with${suffix}`;
      const source = `${line}${newline}Following story.${newline}end${newline}`;
      let markedEnd = -1;
      const cursor = parseSource(source).cursor();
      do { if (cursor.name === "LuauSparkdownExplicitStatement") markedEnd = cursor.to; } while (cursor.next());
      expect(markedEnd).toBe(line.length);
      expect(treeScopeStackAt(parseSource(source), source.indexOf("Following"))).toContain("string.display.text.chunk.sd");
      const errors = compile(source).errors;
      const parity = await compareEnginesFull(source);
      results.push({ newline, suffix, errors: errors.length, divergences: parity.divergences.length });
    }
    console.log("1374 STRUCTURED BOUNDARY", keyword, JSON.stringify(results));
    expect(results.every((result: any) => result.errors > 0)).toBe(true);
    expect(results.every((result: any) => result.divergences === 0)).toBe(true);
  });
});
