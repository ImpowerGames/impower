// A statement lowered inside a nested block (an `if` body, an `else` arm, a
// loop body) reports the same diagnostics it reports directly in a scene,
// on its own line, and a scene-level statement still reports each one once.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const CHOICE_MARK = "must appear inside a `choose ... end` block";
const EMPTY_DIVERT = "Empty diverts (->) are only valid on choices";

const scene = (body: string) =>
  `store n = 0\n-> s\nscene s\n${body}\n  Done.\n  fin\n\nend\n`;

const count = (messages: string[], fragment: string) =>
  messages.filter((m) => m.includes(fragment)).length;

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

// The zero-based start lines of every diagnostic whose message holds
// `fragment`.
const diagnosticLines = (source: string, fragment: string) => {
  const uri = "file:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ],
  } as never);
  const program = compiler.compile({ textDocument: { uri } } as never).program;
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d: any) => message(d).includes(fragment))
    .map((d: any) => d.range.start.line);
};

const IN_IF = "  if n == 0 then\n    * [Pick]\n      Picked.\n  end";

describe("diagnostics from statements inside nested blocks", () => {
  test.each([
    ["directly in the scene", "  * [Pick]\n    Picked."],
    ["inside an if block", IN_IF],
    [
      "inside an else arm",
      "  if n == 1 then\n    Skipped.\n  else\n    * [Pick]\n      Picked.\n  end",
    ],
    [
      "inside a while loop",
      "  while n < 2 do\n    n = n + 1\n    * [Pick]\n      Picked.\n  end",
    ],
    ["inside an if block, written with +", "  if n == 0 then\n    + [Pick]\n      Picked.\n  end"],
  ])("a choice without choose %s reports the choice-mark error once", (_, body) => {
    const ctx = makeRuntimeStoryFromSource(scene(body));
    expect(count(ctx.errorMessages, CHOICE_MARK)).toBe(1);
  });

  test("the nested choice-mark error sits on the choice's own line", () => {
    // Line 4 (zero-based) is `    * [Pick]`, below the `if` on line 3.
    expect(diagnosticLines(scene(IN_IF), CHOICE_MARK)).toEqual([4]);
  });

  test("a choice inside choose inside an if block reports no choice-mark error", () => {
    const ctx = makeRuntimeStoryFromSource(
      scene("  if n == 0 then\n    choose\n      * [Pick]\n        Picked.\n    end\n  end"),
    );
    expect(count(ctx.errorMessages, CHOICE_MARK)).toBe(0);
  });

  test.each([
    ["directly in the scene", "  ->"],
    ["inside an if block", "  if n == 0 then\n    ->\n  end"],
  ])("an empty divert %s reports its warning once", (_, body) => {
    const ctx = makeRuntimeStoryFromSource(scene(body));
    expect(count(ctx.warningMessages, EMPTY_DIVERT)).toBe(1);
  });

  test("the nested empty-divert warning sits on the divert's own line", () => {
    expect(diagnosticLines(scene("  if n == 0 then\n    ->\n  end"), EMPTY_DIVERT)).toEqual([4]);
  });
});
