import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { stripStyleCodes } from "@impower/sparkdown/src/runtime/displayStyle";
import { testCompiler, testStory } from "@impower/sparkdown/src/tests/engineUnderTest";
import { describe, expect, test } from "vitest";
import { previewBeatAt } from "@impower/sparkdown/src/compiler/utils/previewStartPoint";
import { getPreviewLine } from "../../utils/providers/getPreviewLine";

const URI = "inmemory:///main.sd";

interface Shown {
  kind: string;
  words: string;
  speaker?: string;
}

const KINDS: Record<string, string> = {
  action: "action",
  dialogue: "dialogue",
  heading: "heading",
  title: "title",
  transitional: "transition",
};

const scriptOf = (lines: string[]) =>
  ["scene start", ...lines.map((line) => `  ${line}`), "end", ""].join("\n");

const shownWords = (text: string) =>
  stripStyleCodes(text)
    .replace(/\[\[[^\]]*\]\]|\(\([^)]*\)\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const entriesOf = (instruction: unknown): Record<string, unknown> =>
  Object.fromEntries(
    [...((instruction as { value?: Map<string, unknown> }).value?.entries() ?? [])].map(
      ([key, value]) => [key, (value as { valueObject?: unknown })?.valueObject],
    ),
  );

const shownBy = (story: ReturnType<typeof testStory>): Shown => {
  for (let step = 0; step < 20 && story.canContinue; step += 1) {
    story.Continue();
    const [instruction] = story.currentDisplayInstructions;
    if (instruction) {
      const shown = entriesOf(instruction);
      const character = shown["character"];
      return {
        kind: shown["caption"] ? "choice" : KINDS[String(shown["target"])]!,
        words: shownWords(String(shown["text"] ?? "")),
        ...(typeof character === "string" && !shown["caption"] ? { speaker: character } : {}),
      };
    }
  }
  return {
    kind: "choice",
    words: story.currentChoices.map((choice) => shownWords(choice.text)).join(" · "),
  };
};

const previewAt = (text: string, line: number): { game: Shown | null; strip: Partial<Shown> } => {
  const compiler = testCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const beat = previewBeatAt(program, URI, line);
  let game: Shown | null = null;
  if (beat) {
    const story = testStory(program.chunks!);
    story.ChooseAddress(beat.address);
    game = shownBy(story);
  }
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const location = beat?.location;
  const strip = getPreviewLine(
    documents.get(URI)!,
    documents.tree(URI)!,
    line,
    location ? { line: location.startLine, character: location.startColumn } : null,
  ) as Partial<Shown>;
  return {
    game,
    strip: {
      kind: strip.kind,
      words: strip.words,
      ...(strip.speaker ? { speaker: strip.speaker } : {}),
    },
  };
};

interface Row {
  shape: string;
  lines: string[];
  caret: number;
  shows: Shown;
}

const ROWS: Row[] = [
  {
    shape: "one break, the beat before it",
    lines: ["ALICE:", "  Hello. >", "  Goodbye."],
    caret: 2,
    shows: { kind: "dialogue", words: "Hello.", speaker: "ALICE" },
  },
  {
    shape: "one break, the beat after it",
    lines: ["ALICE:", "  Hello. >", "  Goodbye.", "  And more."],
    caret: 4,
    shows: { kind: "dialogue", words: "Goodbye. And more.", speaker: "ALICE" },
  },
  {
    shape: "several spaced breaks on one line",
    lines: [":", "  The room. > The door. > The end."],
    caret: 2,
    shows: { kind: "action", words: "The end." },
  },
  {
    shape: "a touching break",
    lines: [":", "  The room. >The door."],
    caret: 2,
    shows: { kind: "action", words: "The door." },
  },
  {
    shape: "a break in one-line dialogue",
    lines: ["BOB: Hi. > There."],
    caret: 1,
    shows: { kind: "dialogue", words: "There.", speaker: "BOB" },
  },
  {
    shape: "glue before a break",
    lines: [":", "  You see a ..", "  .. door. >", "  Then."],
    caret: 2,
    shows: { kind: "action", words: "You see a door." },
  },
  {
    shape: "glue after a break, on the break's line",
    lines: [":", "  Listen. > ..", "  Then."],
    caret: 2,
    shows: { kind: "action", words: "Listen." },
  },
  {
    shape: "glue after a break, on the next beat's line",
    lines: [":", "  Listen. > ..", "  Then."],
    caret: 3,
    shows: { kind: "action", words: "Then." },
  },
  {
    shape: "a command starting a beat",
    lines: [":", "  Listen. >", "  [[mia]]", "  Then."],
    caret: 3,
    shows: { kind: "action", words: "Then." },
  },
  {
    shape: "a comment line between a break and the next beat",
    lines: [":", "  Listen. >", "  // a note", "  Then."],
    caret: 4,
    shows: { kind: "action", words: "Then." },
  },
  {
    shape: "an empty beat the compiler drops, mid-line",
    lines: [":", "  Listen. > > Then."],
    caret: 2,
    shows: { kind: "action", words: "Then." },
  },
  {
    shape: "an empty beat the compiler drops, on its own line",
    lines: [":", "  Listen. >", "  >", "  Then."],
    caret: 3,
    shows: { kind: "action", words: "Then." },
  },
  {
    shape: "an inline caption with a break",
    lines: ["choose", "  ALICE: Listen. > Will you help?", "  * [Yes.]", "end"],
    caret: 2,
    shows: { kind: "choice", words: "Will you help?" },
  },
  {
    shape: "a block caption, its earlier beat",
    lines: ["choose", "  ALICE:", "    Listen carefully. > ..", "    Will you help?", "  * [Yes.]", "end"],
    caret: 3,
    shows: { kind: "dialogue", words: "Listen carefully.", speaker: "ALICE" },
  },
  {
    shape: "a block caption, its question",
    lines: ["choose", "  ALICE:", "    Listen carefully. > ..", "    Will you help?", "  * [Yes.]", "end"],
    caret: 4,
    shows: { kind: "choice", words: "Will you help?" },
  },
  {
    shape: "a block caption, a command before its question",
    lines: ["choose", "  ALICE:", "    Listen carefully. >", "    [[mia]]", "    Will you help?", "  * [Yes.]", "end"],
    caret: 4,
    shows: { kind: "choice", words: "Will you help?" },
  },
  {
    shape: "a choose block with a caption, on an option",
    lines: ["choose", "  Where now?", "  * [North.]", "  * [South.]", "end"],
    caret: 3,
    shows: { kind: "choice", words: "Where now?" },
  },
  {
    shape: "a choose block without a caption, on an option",
    lines: ["choose", "  * [North.]", "  * [South.]", "end"],
    caret: 2,
    shows: { kind: "choice", words: "North. · South." },
  },
  {
    shape: "a choose block without a caption, an option with response text",
    lines: ["choose", "  * [North.] You turn north.", "  * [South.]", "end"],
    caret: 2,
    shows: { kind: "choice", words: "North. · South." },
  },
  {
    shape: "a choose block without a caption, an option that diverts",
    lines: ["choose", "  * [North.] -> start", "  * [South.]", "end"],
    caret: 2,
    shows: { kind: "choice", words: "North. · South." },
  },
  {
    shape: "a block caption, the choose line",
    lines: ["choose", "  ALICE:", "    Listen carefully. >", "    [[mia]]", "    Will you help?", "  * [Yes.]", "end"],
    caret: 1,
    shows: { kind: "choice", words: "Will you help?" },
  },
  {
    shape: "a block caption, its speaker line",
    lines: ["choose", "  ALICE:", "    Listen carefully. >", "    [[mia]]", "    Will you help?", "  * [Yes.]", "end"],
    caret: 2,
    shows: { kind: "dialogue", words: "Listen carefully.", speaker: "ALICE" },
  },
  {
    shape: "a block caption, the block's end",
    lines: ["choose", "  ALICE:", "    Listen carefully. >", "    [[mia]]", "    Will you help?", "  * [Yes.]", "end"],
    caret: 7,
    shows: { kind: "choice", words: "Will you help?" },
  },
  {
    shape: "the end of a captioned block whose options sit inside an if block",
    lines: ["choose", "  Where now?", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"],
    caret: 7,
    shows: { kind: "choice", words: "Where now?" },
  },
  {
    shape: "a choose block whose options sit inside an if block, on an option",
    lines: ["choose", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"],
    caret: 3,
    shows: { kind: "choice", words: "North. · South." },
  },
  {
    shape: "a choose block whose options sit inside a do block",
    lines: ["choose", "  do", "    * [North.]", "    * [South.]", "  end", "end"],
    caret: 3,
    shows: { kind: "choice", words: "North. · South." },
  },
  {
    shape: "a captioned choose block whose options sit inside an if block",
    lines: ["choose", "  Where now?", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"],
    caret: 4,
    shows: { kind: "choice", words: "Where now?" },
  },
  {
    shape: "the choose line of a block whose options sit inside an if block",
    lines: ["choose", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"],
    caret: 1,
    shows: { kind: "choice", words: "North. · South." },
  },
  {
    shape: "the inner block's end inside a captioned choose block with an option's response",
    lines: ["choose", "  Question?", "  if true then", "    * [One]", "      Response.", "    * [Two]", "  end", "end"],
    caret: 7,
    shows: { kind: "choice", words: "Question?" },
  },
  {
    shape: "the choose line of a block with a beat inside an if before its options",
    lines: ["choose", "  if true then", "    Intro.", "  end", "  * [One]", "  * [Two]", "end"],
    caret: 1,
    shows: { kind: "choice", words: "One · Two" },
  },
  {
    shape: "the end of a block with a beat inside an if before its options",
    lines: ["choose", "  if true then", "    Intro.", "  end", "  * [One]", "  * [Two]", "end"],
    caret: 7,
    shows: { kind: "choice", words: "One · Two" },
  },
  {
    shape: "a beat inside an if before a block's options, on its own line",
    lines: ["choose", "  if true then", "    Intro.", "  end", "  * [One]", "  * [Two]", "end"],
    caret: 3,
    shows: { kind: "action", words: "Intro." },
  },
];

describe("the strip shows the beat the game previews for the caret's line", () => {
  test.each(ROWS)("$shape", ({ lines, caret, shows }) => {
    const { game, strip } = previewAt(scriptOf(lines), caret);
    expect(strip, "the strip names the beat the game shows").toEqual(game);
    expect(game, "what the game shows").toEqual(shows);
  });
});
