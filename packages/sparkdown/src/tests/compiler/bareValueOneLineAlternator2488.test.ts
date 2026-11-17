import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { getParser } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const SINGLE = "LuauSparkdownSingleLineConditionalAlternatorBlock";
const MULTI = "LuauSparkdownConditionalAlternatorBlock";
const SEQUENTIAL = "LuauSparkdownSingleLineSequentialAlternatorBlock";
const MISSING_SCENE_END =
  "Scene is missing its closing `end` keyword. Every `scene` block must be terminated by an explicit `end` at the same indentation as the `scene` keyword.";

const scene = (...lines: string[]) => ["scene start", '  local mood = "happy"', "  local n = 2", '  local player = { mood = "happy" }', ...lines.map((line) => `  ${line}`), "  After.", "end", ""].join("\n");

const blocks = (text: string) => {
  const found: { name: string; text: string; parent: string }[] = [];
  getParser()
    .parse(text)
    .iterate({
      enter: (ref) => {
        if (/Alternator(Block|Arm)$|^ImplicitAction$/.test(ref.name)) {
          found.push({ name: ref.name, text: text.slice(ref.from, ref.to).trim(), parent: ref.node.parent?.parent?.name ?? "" });
        }
      },
    });
  return found;
};

const storyTextHoldingBars = (text: string) =>
  blocks(text)
    .filter((node) => node.name === "ImplicitAction" && /[|]|\bend\b/.test(node.text))
    .map((node) => node.text);

const play = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, out: ctx.story.ContinueMaximally() };
};

describe("a one-line match or plural whose value is a name or a number", () => {
  test.each([
    ["match mood | happy = A. | other = B. end", "match(mood) | happy = A. | other = B. end"],
    ["plural n | one = A. | other = B. end", "plural(n) | one = A. | other = B. end"],
    ["match mood|happy=A.|other=B. end", "match(mood)|happy=A.|other=B. end"],
    ["match player.mood | happy = A. | other = B. end", "match(player.mood) | happy = A. | other = B. end"],
    ["plural 1 | one = A. | other = B. end", "plural(1) | one = A. | other = B. end"],
    ["plural 0x1F | one = A. | other = B. end", "plural(0x1F) | one = A. | other = B. end"],
    ["plural 1.5e2 | one = A. | other = B. end", "plural(1.5e2) | one = A. | other = B. end"],
    ["plural .5 | one = A. | other = B. end", "plural(.5) | one = A. | other = B. end"],
    ["plural .5e1 | one = A. | other = B. end", "plural(.5e1) | one = A. | other = B. end"],
    ["plural -1 | one = A. | other = B. end", "plural(-1) | one = A. | other = B. end"],
    ["plural -.5 | one = A. | other = B. end", "plural(-.5) | one = A. | other = B. end"],
    ["plural 1. | one = A. | other = B. end", "plural(1.) | one = A. | other = B. end"],
    ["plural 0b101 | one = A. | other = B. end", "plural(0b101) | one = A. | other = B. end"],
    ["plural 1|one=A.|other=B. end", "plural(1)|one=A.|other=B. end"],
    ["match self | other = B. end", "match(self) | other = B. end"],
  ])("the grammar reads `%s` as a one-line set, as it reads `%s`", (bare, bracketed) => {
    const shape = (text: string) => blocks(scene(text)).map(({ name }) => name);
    expect(blocks(scene(bare))[0]).toMatchObject({ name: SINGLE, text: bare });
    expect(storyTextHoldingBars(scene(bare))).toEqual([]);
    expect(shape(bare)).toEqual(shape(bracketed));
  });

  test.each([
    ["match mood | happy = A. | other = B. end", "A.\nAfter.\n"],
    ["match(mood) | happy = A. | other = B. end", "A.\nAfter.\n"],
    ["plural n | one = A. | other = B. end", "B.\nAfter.\n"],
    ["plural(n) | one = A. | other = B. end", "B.\nAfter.\n"],
    ["plural 1 | one = A. | other = B. end", "A.\nAfter.\n"],
    ["plural .5 | one = A. | other = B. end", "B.\nAfter.\n"],
    ["plural -1 | one = A. | other = B. end", "A.\nAfter.\n"],
    ['match("very happy") | other = She waits. end', "She waits.\nAfter.\n"],
  ])("the game plays `%s` as alternatives", (line, out) => {
    expect(play(scene(line))).toEqual({ errors: [], warnings: [], out });
  });

  test.each([
    ["cycle | match mood | happy = A. | other = B. end | C. end", "match mood | happy = A. | other = B. end"],
    ["cycle | match(mood) | happy = A. | other = B. end | C. end", "match(mood) | happy = A. | other = B. end"],
    ["cycle | plural n | one = A. | other = B. end | C. end", "plural n | one = A. | other = B. end"],
  ])("`%s` nests its conditional set in the first option", (line, inner) => {
    const found = blocks(scene(line));
    expect(found[0]).toMatchObject({ name: SEQUENTIAL, text: line });
    expect(found).toContainEqual({ name: SINGLE, text: inner, parent: SEQUENTIAL });
    expect(storyTextHoldingBars(scene(line))).toEqual([]);
  });

  test("the game plays a nested bare-value set as it plays the bracketed one", () => {
    const loop = (line: string) => scene("for i = 1, 2 do", `  ${line}`, "end");
    const bare = play(loop("cycle | match mood | happy = A. | other = B. end | C. end"));
    const bracketed = play(loop("cycle | match(mood) | happy = A. | other = B. end | C. end"));
    expect(bare).toEqual({ errors: [], warnings: [], out: "A.\nC.\nAfter.\n" });
    expect(bare).toEqual(bracketed);
  });

  test.each([
    ["a call", "match string.upper(mood) | HAPPY = A. | other = B. end"],
    ["a concatenation", 'match mood .. "_day" | happy_day = A. | other = B. end'],
    ["a sum", "plural n - 1 | one = A. | other = B. end"],
    ["a backtick string", "match `{mood} day` | happy_day = A. | other = B. end"],
    ["a long string", "match [[very happy]] | other = B. end"],
    ["a value with a comment", "match mood --[[ c ]] | happy = A. | other = B. end"],
    ["a method call on a dotted name", "match player.mood:upper() | HAPPY = A. | other = B. end"],
    ["an index", "match player['mood'] | happy = A. | other = B. end"],
    ["a reserved word", "match true | other = B. end"],
    ["nil", "match nil | other = B. end"],
    ["a dotted name ending in a reserved word", "match player.end | other = B. end"],
    ["a name starting with a digit", "match 1x | other = B. end"],
    ["a double-quoted string", 'match "very happy" | other = B. end'],
    ["a single-quoted string", "match 'happy' | happy = A. | other = B. end"],
    ["an interpolated double-quoted string", 'match "{mood}" | happy = A. | other = B. end'],
  ])("a bare value that is %s is left to the multi-line set, as without this change", (_, line) => {
    const found = blocks(scene(line));
    expect(found[0]).toMatchObject({ name: MULTI });
    expect(found[0]!.text.endsWith("After.\nend")).toBe(true);
    expect(found.map(({ name }) => name)).not.toContain(SINGLE);
    expect(play(scene(line)).errors).toContain(MISSING_SCENE_END);
  });

  test.each([
    ["match mood", "| happy = A.", "| other = B.", "end"],
    ["match(mood)", "| happy = A.", "| other = B.", "end"],
    ["plural n", "| one = A.", "| other = B.", "end"],
    ['match mood .. ""', "| happy = A.", "| other = B.", "end"],
  ])("a multi-line set opened by `%s` stays a multi-line set", (...lines) => {
    const found = blocks(scene(...lines));
    expect(found[0]).toMatchObject({ name: MULTI, text: lines.join("\n  ") });
    expect(found.map(({ name }) => name)).not.toContain(SINGLE);
    expect(play(scene(...lines))).toEqual({ errors: [], warnings: [], out: lines[0]!.startsWith("plural") ? "B.\nAfter.\n" : "A.\nAfter.\n" });
  });

  test.each([
    ["match [[a | b]]"],
    ["match [=[a | b]=]"],
    ["match [====[a ]=====] | b]====]"],
    ["match mood -- a | b"],
    ["match mood --[[ a | b ]]"],
    ["plural n -- a | b"],
    ["match `outer {`a | b`}`"],
    [`match "{'a" | b'}"`],
    [`match "{1 --[[ " | hidden ]]}"`],
    ["match 'a | b'"],
  ])("a multi-line set whose head `%s` holds a bar in a string or comment stays a multi-line set", (head) => {
    const lines = [head, "| other = B.", "end"];
    const found = blocks(scene(...lines));
    expect(found[0]).toMatchObject({ name: MULTI, text: lines.join("\n  ") });
    expect(found.map(({ name }) => name)).not.toContain(SINGLE);
    expect(play(scene(...lines))).toEqual({ errors: [], warnings: [], out: "B.\nAfter.\n" });
  });

  test("a bracketed value holding a closed block comment opens a one-line set, as without this change", () => {
    const line = 'match("happy" --[[ note | hidden ]]) | happy = A. | other = B. end';
    expect(blocks(scene(line))[0]).toMatchObject({ name: SINGLE, text: line });
    expect(play(scene(line))).toEqual({ errors: [], warnings: [], out: "A.\nAfter.\n" });
  });

  test.each([
    [["match mood | happy = A.", "| other = B.", "end"], ["match(mood) | happy = A.", "| other = B.", "end"]],
    [["plural n | one = A.", "| other = B.", "end"], ["plural(n) | one = A.", "| other = B.", "end"]],
    [["match mood | happy = cycle | A. | B. end", "| other = C.", "end"], ["match(mood) | happy = cycle | A. | B. end", "| other = C.", "end"]],
  ])("a head line `%s` whose arms continue below reads as its bracketed spelling does, with errors shown", (bare, bracketed) => {
    const shape = (lines: string[]) => blocks(scene(...lines)).map(({ name }) => name);
    expect(blocks(scene(...bare))[0]).toMatchObject({ name: SINGLE, text: bare[0] });
    expect(shape(bare)).toEqual(shape(bracketed));
    const bareRun = play(scene(...bare));
    expect(bareRun.errors).toEqual(play(scene(...bracketed)).errors);
    expect(bareRun.errors).toEqual([
      "statement must be inside a scene or branch; the top level holds declarations only",
      "Expected <eof>, got 'end'",
    ]);
  });

  test.each([
    ["match mood | happy = A. | other = B. end --[[ note ]]"],
    ["match mood | happy = A. | other = B. end --[====[ note ]====] -- trailing"],
    ["match(mood) | happy = A. | other = B. end --[[ note ]]"],
  ])("`%s` closes its one-line set before a trailing comment", (line) => {
    expect(blocks(scene(line))[0]).toMatchObject({ name: SINGLE });
    expect(play(scene(line))).toEqual({ errors: [], warnings: [], out: "A.\nAfter.\n" });
  });

  test.each([
    ["a word that starts with the keyword", "matchbox | A. | B. end"],
    ["the keyword with no value", "match | A. | B. end"],
    ["a reserved word as the value", "match not | A. | B. end"],
  ])("%s does not open a one-line conditional set", (_, line) => {
    expect(blocks(scene(line)).map(({ name }) => name)).not.toContain(SINGLE);
  });

  test("the editor and the tree give a bare-value line the same scopes", async () => {
    const text = scene("match mood | happy = A. | other = B. end", "cycle | plural n | one = A. | other = B. end | C. end", "plural 1 | one = A. | other = B. end");
    const result = await compareEnginesFull(text);
    expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
  });
});
