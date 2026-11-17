import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { describe, expect, test } from "vitest";
import { isOneLineStorySet, storyAlternatorArms } from "../../compiler/utils/alternatorDecision";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { getParser } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const SET = "LuauSparkdownConditionalAlternatorBlock";
const NESTED_SET = "LuauSparkdownSingleLineConditionalAlternatorBlock";
const GRAMMAR = "definitions/yaml/sparkdown-luau.language-grammar.yaml";

const scene = (...lines: string[]) =>
  ["scene start", '  local mood = "happy"', "  local n = 2", '  local player = { mood = "happy" }', ...lines.map((line) => `  ${line}`), "  After.", "end", ""].join("\n");

const sets = (text: string) => {
  const found: { node: SyntaxNode; text: string; value: string | undefined; oneLine: boolean; arms: string | undefined }[] = [];
  getParser()
    .parse(text)
    .iterate({
      enter: (ref) => {
        if (ref.name !== SET && ref.name !== NESTED_SET) return;
        const node = ref.node;
        const condition = getDescendent("LuauConditionalAlternatorCondition", node);
        const value = condition ? text.slice(condition.from, condition.to).trim() : undefined;
        found.push({ node, text: text.slice(ref.from, ref.to).trim(), value, oneLine: isOneLineStorySet(node), arms: storyAlternatorArms(node)?.name });
      },
    });
  return found;
};

const storyTextHoldingBars = (text: string) => {
  const found: string[] = [];
  getParser()
    .parse(text)
    .iterate({
      enter: (ref) => {
        if (ref.name === "ImplicitAction" && /[|]/.test(text.slice(ref.from, ref.to))) found.push(text.slice(ref.from, ref.to).trim());
      },
    });
  return found;
};

const play = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, out: ctx.story.ContinueMaximally() };
};

const BRACKETS = /^On one line, put the value of `(match|plural)` in brackets/;

const ONE_LINE_FINDINGS: [string, string, string][] = [
  ["a string with spaces (6944032782)", '"very happy"', "match"],
  ["a long string holding a bar (6945053806)", "[=[a | b]=]", "match"],
  ["a long string of a higher level holding a lower closer (6945053806)", "[====[a ]=====] | b]====]", "match"],
  ["a nested interpolated backtick string (6948037598)", "`outer {`a | b`}`", "match"],
  ["an interpolated string holding a quote and a bar (6948664604)", `"{'a" | b'}"`, "match"],
  ["an interpolated string holding a comment with a bar (6948664604)", '"{1 --[[ " | hidden ]]}"', "match"],
  ["a call", "string.upper(mood)", "match"],
  ["a concatenation", 'mood .. "_day"', "match"],
  ["a method call", "player.mood:upper()", "match"],
  ["an index", "player['mood']", "match"],
  ["a reserved word", "true", "match"],
  ["nil", "nil", "match"],
  ["a sum", "n - 1", "plural"],
];

const ONE_LINE_ACCEPTED: [string, string, string][] = [
  ["a name", "mood", "match"],
  ["a dotted name", "player.mood", "match"],
  ["a dotted name with spaces around the dot (6949388435)", "player . mood", "match"],
  ["a leading-dot number (6948664604)", ".5", "plural"],
  ["a number with an underscore after its exponent mark (6949388435)", "1e_2", "plural"],
  ["a negative number", "-1", "plural"],
  ["a hexadecimal number", "0x1F", "plural"],
];

describe("a story match or plural is one-line or multi-line by what follows its parsed value", () => {
  test("the grammar keeps no copy of Luau value syntax for the one-line reading", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const grammar = readFileSync(resolve(__dirname, "../../../../..", GRAMMAR), "utf8");
    expect(grammar).not.toMatch(/LUAU_ONE_LINE_ALTERNATOR_/);
    const rule = /\n {2}LuauSparkdownConditionalAlternatorHead:\n {4}begin: (.*)\n/.exec(grammar);
    expect(rule?.[1]).toBe("\\G(?!^)(?!{{WS}}*[|])");
  });

  test.each([...ONE_LINE_FINDINGS, ...ONE_LINE_ACCEPTED])(
    "%s (`%s`) opens a one-line set bare, as its bracketed spelling does, with the value its own node",
    (_, value, keyword) => {
      const arms = keyword === "plural" ? "| one = A. | other = B. end" : "| happy = A. | other = B. end";
      const bare = `${keyword} ${value} ${arms}`;
      const bracketed = `${keyword}(${value}) ${arms}`;
      for (const [line, expected] of [[bare, value], [bracketed, `(${value})`]] as const) {
        const [set] = sets(scene(line));
        expect(set).toMatchObject({ text: line, value: expected, oneLine: true, arms: "LuauSparkdownSingleLineAlternatorArms" });
        expect(storyTextHoldingBars(scene(line))).toEqual([]);
      }
    },
  );

  test.each(ONE_LINE_ACCEPTED)("%s (`%s`) is accepted bare and plays as its bracketed spelling does", (_, value, keyword) => {
    const arms = keyword === "plural" ? "| one = A. | other = B. end" : "| happy = A. | other = B. end";
    const bare = play(scene(`${keyword} ${value} ${arms}`));
    expect(bare.errors).toEqual([]);
    expect(bare).toEqual(play(scene(`${keyword}(${value}) ${arms}`)));
  });

  test.each(ONE_LINE_FINDINGS)("%s (`%s`) is diagnosed bare, asking for brackets, and plays its arms", (_, value, keyword) => {
    const arms = keyword === "plural" ? "| one = A. | other = B. end" : "| happy = A. | other = B. end";
    const bare = play(scene(`${keyword} ${value} ${arms}`));
    expect(bare.errors.filter((message) => BRACKETS.test(message))).toHaveLength(1);
    expect(play(scene(`${keyword}(${value}) ${arms}`)).errors.filter((message) => BRACKETS.test(message))).toEqual([]);
    expect(bare.out.endsWith("After.\n")).toBe(true);
    expect(bare.out).not.toContain("|");
  });

  test.each([
    ["a bar in a long string (6944586878)", "match [[a | b]]"],
    ["a bar in a long string of a higher level (6945053806)", "match [====[a ]=====] | b]====]"],
    ["a bar in a line comment (6944586878)", "match mood -- a | b"],
    ["a bar in a block comment (6944586878)", "match mood --[[ a | b ]]"],
    ["a bar in a nested backtick string (6948037598)", "match `outer {`a | b`}`"],
    ["a quote and a bar in an interpolation (6948664604)", `match "{'a" | b'}"`],
    ["a comment and a bar in an interpolation (6948664604)", `match "{1 --[[ " | hidden ]]}"`],
    ["a bare name", "match mood"],
    ["a bracketed name", "match(mood)"],
    ["a concatenation", 'match mood .. ""'],
    ["a number", "plural n"],
  ])("a multi-line header with %s stays multi-line and plays its arms", (_, head) => {
    const lines = [head, "| other = B.", "end"];
    const [set] = sets(scene(...lines));
    expect(set).toMatchObject({ text: lines.join("\n  "), oneLine: false, arms: "LuauSparkdownAlternatorArmLines" });
    expect(play(scene(...lines))).toEqual({ errors: [], warnings: [], out: "B.\nAfter.\n" });
  });

  test.each([
    ["a trailing block comment (6945465171)", "match mood | happy = A. | other = B. end --[[ note | x ]]", "A.\nAfter.\n"],
    ["a nested set in an arm (6945465171)", "match mood | happy = cycle | A. | B. end | other = C. end", "A.\nAfter.\n"],
    ["an escaped end in an arm (6945465171)", "match mood | happy = A \\end. | other = B. end", "A end.\nAfter.\n"],
  ])("a one-line set with %s ends at its own `end`", (_, line, out) => {
    const [set] = sets(scene(line));
    expect(set).toMatchObject({ oneLine: true });
    expect(play(scene(line))).toEqual({ errors: [], warnings: [], out });
  });

  test("a value with a block comment before the bar opens a one-line set (6945053806)", () => {
    const line = "match mood --[[ c | d ]] | happy = A. | other = B. end";
    const [set] = sets(scene(line));
    expect(set).toMatchObject({ oneLine: true });
    expect(play(scene(line)).out).toBe("A.\nAfter.\n");
  });

  test("a bar after the value on the keyword's line makes a one-line set, whose missing `end` is reported (#2498)", () => {
    const lines = ["match mood | happy = A.", "| other = B.", "end"];
    const [set] = sets(scene(...lines));
    expect(set).toMatchObject({ text: lines[0], oneLine: true });
    expect(play(scene(...lines)).errors).toEqual(play(scene("match(mood) | happy = A.", "| other = B.", "end")).errors);
  });

  test("in an arm, a keyword and a value with no bar after them is a nested set with no arms", () => {
    const line = "cycle | plural n end";
    const nested = sets(scene(line));
    expect(nested).toMatchObject([{ text: "plural n", oneLine: false, arms: undefined }]);
    expect(play(scene(line)).errors).toContain("A `plural` needs at least one arm, written `| value = ...`");
  });

  test("the editor and the tree give the new readings the same scopes", async () => {
    const text = scene(
      'match "very happy" | other = B. end',
      "match `outer {`a | b`}` | other = B. end",
      "plural .5 | one = A. | other = B. end",
      "match [[a | b]]",
      "| other = B.",
      "end",
      "cycle | match mood | happy = A. | other = B. end | C. end",
    );
    const result = await compareEnginesFull(text);
    expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
  });
});
