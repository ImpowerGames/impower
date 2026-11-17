import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { getParser } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences, vscodeScopeStacksPerChar } from "./scopeEquality";

const URI = "inmemory:///main.sd";
const ONE_LINE_BLOCKS = new Set(["LuauSparkdownSingleLineSequentialAlternatorBlock", "LuauSparkdownSingleLineConditionalAlternatorBlock"]);
const OPEN_MESSAGE =
  "This one-line alternator is missing its closing `end` keyword. Without it, the lines below it are read as part of this one-line alternator, up to the next `scene`, `branch` or the end of the file.";

const looped = (line: string) => ["scene start", "  for i = 1, 4 do", `    ${line}`, "  end", "  After.", "end", ""].join("\n");

const play = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, out: ctx.story.ContinueMaximally() };
};

const errorLines = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program as {
    diagnostics?: Record<string, { message: string | { value: string }; range: { start: { line: number } } }[]>;
  };
  return (program.diagnostics?.[URI] ?? []).map((d) => ({
    line: d.range.start.line,
    message: typeof d.message === "string" ? d.message : d.message.value,
  }));
};

const nestedInArms = (text: string): string[] => {
  const found: string[] = [];
  getParser()
    .parse(text)
    .iterate({
      enter: (ref) => {
        const outer = ref.node.parent?.parent;
        if (ONE_LINE_BLOCKS.has(ref.name) && outer && ONE_LINE_BLOCKS.has(outer.name)) found.push(text.slice(ref.from, ref.to).trim());
      },
    });
  return found;
};

const TICKET = "scene start\n  Before.\n  queue | queue | In A. | In B. end | Out. end queue | Three. | Four. end\n  After.\nend\n";

describe("a one-line alternator block inside an arm of another one-line block", () => {
  test.each([
    ["the ticket's line", TICKET, ["queue | In A. | In B. end"]],
    ["a sequential block in the first arm", looped("queue | cycle | In A. | In B. end | Out. end"), ["cycle | In A. | In B. end"]],
    ["a sequential block in the last arm", looped("cycle | One. | queue | In A. | In B. end end"), ["queue | In A. | In B. end"]],
    ["a conditional block in an arm", looped("cycle | match(1) | Small. | Big. end | Two. end"), ["match(1) | Small. | Big. end"]],
    [
      "blocks nested two deep",
      looped("cycle | cycle | cycle | D1. | D2. end | I2. end | O2. end"),
      ["cycle | cycle | D1. | D2. end | I2. end", "cycle | D1. | D2. end"],
    ],
  ])("the grammar reads %s as a block in the outer arm", (_, text, blocks) => {
    expect(nestedInArms(text)).toEqual(blocks);
  });

  test.each([
    ["the ticket's line", TICKET, "Before.\nIn A.\nThree.\nAfter.\n"],
    ["a sequential block in the last arm", looped("cycle | One. | queue | In A. | In B. end end"), "One.\nIn A.\nOne.\nIn B.\nAfter.\n"],
    ["blocks nested two deep", looped("cycle | cycle | cycle | D1. | D2. end | I2. end | O2. end"), "D1.\nO2.\nI2.\nO2.\nAfter.\n"],
  ])("the game plays %s's nested block as alternatives", (_, text, out) => {
    expect(play(text)).toEqual({ errors: [], warnings: [], out });
  });

  test("the game plays a nested conditional block as it plays on its own line", () => {
    const alone = play(looped("match(1) | Small. | Big. end"));
    const nested = play(looped("cycle | match(1) | Small. | Big. end | Two. end"));
    expect(alone.errors).toEqual([]);
    const [chosen] = alone.out.split("\n");
    expect(["Small.", "Big."]).toContain(chosen);
    expect(nested).toEqual({ errors: [], warnings: [], out: `${chosen}\nTwo.\n${chosen}\nTwo.\nAfter.\n` });
  });

  test("the editor and the tree give the nested line the same scopes, with the inner keyword a keyword", async () => {
    const result = await compareEnginesFull(TICKET);
    expect(result.divergences, formatDivergences(TICKET, result.divergences)).toEqual([]);
    const scopes = await vscodeScopeStacksPerChar(TICKET);
    const inner = TICKET.indexOf("| queue") + 2;
    expect(scopes[inner]!.some((scope) => scope.startsWith("keyword.control"))).toBe(true);
  });

  test("a backslash keeps a keyword in an arm a word", () => {
    const text = looped("cycle | \\queue | shuffle end");
    expect(nestedInArms(text)).toEqual([]);
    expect(play(text)).toEqual({ errors: [], warnings: [], out: "queue\nshuffle\nqueue\nshuffle\nAfter.\n" });
  });

  test("a keyword later in an arm's words stays a word", () => {
    const text = looped("cycle | Ride the cycle | Walk the chain end");
    expect(nestedInArms(text)).toEqual([]);
    expect(play(text)).toEqual({ errors: [], warnings: [], out: "Ride the cycle\nWalk the chain\nRide the cycle\nWalk the chain\nAfter.\n" });
  });

  test.each([
    ["queue", "Before.\nIn A.\nAfter.\n"],
    ["cycle", "Before.\nIn A.\nAfter.\n"],
  ])("a multi-line block whose arm holds a one-line %s block plays it with no error", (keyword, out) => {
    const text = `scene start\n  Before.\n  queue\n  | ${keyword} | In A. | In B. end\n  | Out.\n  end\n  After.\nend\n`;
    expect(play(text)).toEqual({ errors: [], warnings: [], out });
  });

  test.each([
    ["followed by a story line", "scene start\n  cycle | queue | shuffle end\n  Next line.\n  After.\nend\n"],
    ["followed by its enclosing block's end", looped("cycle | queue | shuffle end")],
    ["whose nested block took the end", "scene start\n  cycle | queue | A. | B. end\n  After.\nend\n"],
    ["running to the end of the file", "scene start\n  queue | queue | In A. | In B. end\n"],
    ["running past blank lines to the end of the file", "scene start\n  queue | queue | In A. | In B. end\n\n\n"],
    ["running to the next scene", "scene start\n  queue | queue | In A. | In B. end\n\nscene next\n  Hi.\nend\n"],
  ])("an outer block left open by a nested block, %s, reports its missing end on its own line", (_, text) => {
    const headerLine = text.split("\n").findIndex((line) => line.includes(" | "));
    expect(errorLines(text)).toContainEqual({ line: headerLine, message: OPEN_MESSAGE });
  });

  test.each([
    ["an end on the next arm's line", "scene start\n  cycle | A.\n  | B. end\n  After.\nend\n"],
    ["an end on its own line after a continued arm", "scene start\n  cycle | A.\n  | B.\n  end\n  After.\nend\n"],
    ["a closed nested block", TICKET],
  ])("a one-line block with %s reports nothing", (_, text) => {
    expect(errorLines(text).map((d) => d.message)).not.toContain(OPEN_MESSAGE);
    expect(play(text).errors).toEqual([]);
  });
});
