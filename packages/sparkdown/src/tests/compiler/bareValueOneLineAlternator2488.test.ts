import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { getParser } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const SINGLE = "LuauSparkdownSingleLineConditionalAlternatorBlock";
const MULTI = "LuauSparkdownConditionalAlternatorBlock";
const SEQUENTIAL = "LuauSparkdownSingleLineSequentialAlternatorBlock";

const scene = (...lines: string[]) => ["scene start", '  local mood = "happy"', "  local n = 2", ...lines.map((line) => `  ${line}`), "  After.", "end", ""].join("\n");

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

describe("a one-line match or plural whose value is a bare name", () => {
  test.each([
    ["match mood | happy = A. | other = B. end", "match(mood) | happy = A. | other = B. end"],
    ["plural n | one = A. | other = B. end", "plural(n) | one = A. | other = B. end"],
    ["match mood|happy=A.|other=B. end", "match(mood)|happy=A.|other=B. end"],
    ["match player.mood | happy = A. | other = B. end", "match(player.mood) | happy = A. | other = B. end"],
    ['match "very happy" | other = B. end', 'match("very happy") | other = B. end'],
    ["match 'a | b' | other = B. end", "match('a | b') | other = B. end"],
    ["match `very {mood}` | other = B. end", "match(`very {mood}`) | other = B. end"],
    ["match [[very happy]] | other = B. end", "match([[very happy]]) | other = B. end"],
    ['match string.upper("very (happy)") | other = B. end', 'match(string.upper("very (happy)")) | other = B. end'],
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
    ['match "very happy" | other = She waits. end', "She waits.\nAfter.\n"],
    ["match `{mood} day` | happy_day = A. | other = B. end", "B.\nAfter.\n"],
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
    ["match mood", "| happy = A.", "| other = B.", "end"],
    ["match(mood)", "| happy = A.", "| other = B.", "end"],
    ["plural n", "| one = A.", "| other = B.", "end"],
  ])("a multi-line set opened by `%s` stays a multi-line set", (...lines) => {
    const found = blocks(scene(...lines));
    expect(found[0]).toMatchObject({ name: MULTI, text: lines.join("\n  ") });
    expect(found.map(({ name }) => name)).not.toContain(SINGLE);
    expect(play(scene(...lines))).toEqual({ errors: [], warnings: [], out: lines[0]!.startsWith("plural") ? "B.\nAfter.\n" : "A.\nAfter.\n" });
  });

  test.each([
    ["a word that starts with the keyword", "matchbox | A. | B. end"],
    ["the keyword with no value", "match | A. | B. end"],
  ])("%s does not open a one-line conditional set", (_, line) => {
    expect(blocks(scene(line)).map(({ name }) => name)).not.toContain(SINGLE);
  });

  test("the editor and the tree give a bare-value line the same scopes", async () => {
    const text = scene("match mood | happy = A. | other = B. end", "cycle | plural n | one = A. | other = B. end | C. end");
    const result = await compareEnginesFull(text);
    expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
  });
});
