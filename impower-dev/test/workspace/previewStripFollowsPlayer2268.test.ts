import type { GameState } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import {
  createPlayerHarness,
  MAIN_URI,
  settle,
  writtenText,
} from "@impower/spark-web-player/src/tests/worker/playerHarness";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { signal } from "@preact/signals";
import { describe, expect, test } from "vitest";
import { answerPreviewLine } from "../../../packages/sparkdown-language-server/src/utils/providers/answerPreviewLine";
import { stripCopy } from "../../src/modules/spark-editor/components/preview-strip/stripCopy";
import WorkspacePreviewLine from "../../src/modules/spark-editor/workspace/WorkspacePreviewLine";
import workspace, {
  type ShownBeatDescription,
} from "../../src/modules/spark-editor/workspace/WorkspaceStore";

interface Shown {
  kind: string;
  words?: string;
  speaker?: string;
}

interface Row {
  shape: string;
  lines: string[];
  caret: number;
  shows: Shown;
  head?: string[];
  tail?: string[];
}

const scriptOf = ({ lines, head = [], tail = [] }: Row) =>
  [...head, "scene start", ...lines.map((line) => `  ${line}`), "end", ...tail, ""].join("\n");

const lastGameState = (sent: any[]): GameState | undefined =>
  sent.filter((m) => m.method === "preview/didChangeGameState").at(-1)?.params;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const stripFor = async (text: string, caret: number, sent: any[]) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({ textDocument: { uri: MAIN_URI, text, version: 1, languageId: "sparkdown" } });
  const shown = signal<ShownBeatDescription>(lastGameState(sent)?.shownBeatDescription ?? null);
  const lines = new WorkspacePreviewLine({
    caret: () => ({ uri: MAIN_URI, line: caret }),
    shownBeatDescription: () => shown.value,
    getPreviewLine: async (uri, line) =>
      answerPreviewLine(
        { document: (u) => documents.get(u), tree: (u) => documents.tree(u) },
        { textDocument: { uri }, line },
      ),
    onPublishedDiagnostics: () => () => {},
  });
  try {
    await flush();
    const preview = workspace.previewLine.value?.preview;
    const copy = stripCopy(preview);
    return { preview, label: copy.label, words: copy.words };
  } finally {
    lines.dispose();
    workspace.previewLine.value = null;
  }
};

const pictureOf = (sent: any[]) => writtenText(sent).replace(/\s+/g, " ");

const harnessAt = async (text: string, caret: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line: caret },
  });
  await h.compile();
  await h.select(caret);
  await settle(40);
  return h;
};

const previewAt = async (text: string, caret: number) => {
  const h = await harnessAt(text, caret);
  try {
    const state = lastGameState(h.toEditor);
    const described = state?.shownBeatDescription ?? null;
    const picture = pictureOf(h.toRouter);
    const strip = await stripFor(text, caret, h.toEditor);
    const ending = state?.ending?.kind ?? null;
    return { described, picture, strip, ending };
  } finally {
    h.dispose();
  }
};

const KIND_LABELS: Record<string, string> = {
  action: "ACTION",
  choice: "CHOOSE",
  title: "TITLE",
  heading: "HEADING",
  transition: "TRANSITIONAL",
};

const copyOf = (shown: Shown) => ({
  label: shown.kind === "dialogue" ? (shown.speaker ?? "") : KIND_LABELS[shown.kind]!,
  words: shown.words ?? "",
});

const action = (words: string): Shown => ({ kind: "action", words });

const choice = (words: string): Shown => ({ kind: "choice", words });

const CAPTION = ["choose", "  ALICE:", "    Listen carefully. >", "    [[mia]]", "    Will you help?", "  * [Yes.]", "end"];

const ROWS: Row[] = [
  { shape: "one break, the beat before it", lines: ["ALICE:", "  Hello. >", "  Goodbye."], caret: 2, shows: { kind: "dialogue", words: "Hello.", speaker: "ALICE" } },
  { shape: "one break, the beat after it", lines: ["ALICE:", "  Hello. >", "  Goodbye.", "  And more."], caret: 4, shows: { kind: "dialogue", words: "Goodbye. And more.", speaker: "ALICE" } },
  { shape: "several spaced breaks on one line", lines: [":", "  The room. > The door. > The end."], caret: 2, shows: action("The end.") },
  { shape: "a touching break", lines: [":", "  The room. >The door."], caret: 2, shows: action("The door.") },
  { shape: "a break in one-line dialogue", lines: ["BOB: Hi. > There."], caret: 1, shows: { kind: "dialogue", words: "There.", speaker: "BOB" } },
  { shape: "glue before a break", lines: [":", "  You see a ..", "  .. door. >", "  Then."], caret: 2, shows: action("You see a door.") },
  { shape: "glue after a break, on the break's line", lines: [":", "  Listen. > ..", "  Then."], caret: 2, shows: action("Listen.") },
  { shape: "glue after a break, on the next beat's line", lines: [":", "  Listen. > ..", "  Then."], caret: 3, shows: action("Then.") },
  { shape: "a command starting a beat", lines: [":", "  Listen. >", "  [[mia]]", "  Then."], caret: 3, shows: action("Then.") },
  { shape: "a comment line between a break and the next beat", lines: [":", "  Listen. >", "  // a note", "  Then."], caret: 4, shows: action("Then.") },
  { shape: "an empty beat the compiler drops, mid-line", lines: [":", "  Listen. > > Then."], caret: 2, shows: action("Then.") },
  { shape: "an empty beat the compiler drops, on its own line", lines: [":", "  Listen. >", "  >", "  Then."], caret: 3, shows: action("Then.") },
  { shape: "an inline caption with a break", lines: ["choose", "  ALICE: Listen. > Will you help?", "  * [Yes.]", "end"], caret: 2, shows: choice("Will you help?") },
  { shape: "a block caption, its earlier beat", lines: ["choose", "  ALICE:", "    Listen carefully. > ..", "    Will you help?", "  * [Yes.]", "end"], caret: 3, shows: { kind: "dialogue", words: "Listen carefully.", speaker: "ALICE" } },
  { shape: "a block caption, its question", lines: ["choose", "  ALICE:", "    Listen carefully. > ..", "    Will you help?", "  * [Yes.]", "end"], caret: 4, shows: choice("Will you help?") },
  { shape: "a block caption, a command before its question", lines: CAPTION, caret: 4, shows: choice("Will you help?") },
  { shape: "a block caption, the choose line", lines: CAPTION, caret: 1, shows: choice("Will you help?") },
  { shape: "a block caption, its speaker line", lines: CAPTION, caret: 2, shows: { kind: "dialogue", words: "Listen carefully.", speaker: "ALICE" } },
  { shape: "a block caption, the block's end", lines: CAPTION, caret: 7, shows: choice("Will you help?") },
  { shape: "a choose block with a caption, on an option", lines: ["choose", "  Where now?", "  * [North.]", "  * [South.]", "end"], caret: 3, shows: choice("Where now?") },
  { shape: "a choose block without a caption, on an option", lines: ["choose", "  * [North.]", "  * [South.]", "end"], caret: 2, shows: choice("North. · South.") },
  { shape: "a choose block without a caption, an option with response text", lines: ["choose", "  * [North.] You turn north.", "  * [South.]", "end"], caret: 2, shows: choice("North. · South.") },
  { shape: "a choose block without a caption, an option that diverts", lines: ["choose", "  * [North.] -> start", "  * [South.]", "end"], caret: 2, shows: choice("North. · South.") },
  { shape: "the end of a captioned block whose options sit inside an if block", lines: ["choose", "  Where now?", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"], caret: 7, shows: choice("Where now?") },
  { shape: "a choose block whose options sit inside an if block, on an option", lines: ["choose", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"], caret: 3, shows: choice("North. · South.") },
  { shape: "a choose block whose options sit inside a do block", lines: ["choose", "  do", "    * [North.]", "    * [South.]", "  end", "end"], caret: 3, shows: choice("North. · South.") },
  { shape: "a captioned choose block whose options sit inside an if block", lines: ["choose", "  Where now?", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"], caret: 4, shows: choice("Where now?") },
  { shape: "the choose line of a block whose options sit inside an if block", lines: ["choose", "  if true then", "    * [North.]", "    * [South.]", "  end", "end"], caret: 1, shows: choice("North. · South.") },
  { shape: "the inner block's end inside a captioned choose block with an option's response", lines: ["choose", "  Question?", "  if true then", "    * [One]", "      Response.", "    * [Two]", "  end", "end"], caret: 7, shows: choice("Question?") },
  { shape: "the choose line of a block with a beat inside an if before its options", lines: ["choose", "  if true then", "    Intro.", "  end", "  * [One]", "  * [Two]", "end"], caret: 1, shows: choice("One · Two") },
  { shape: "the end of a block with a beat inside an if before its options", lines: ["choose", "  if true then", "    Intro.", "  end", "  * [One]", "  * [Two]", "end"], caret: 7, shows: choice("One · Two") },
  { shape: "a beat inside an if before a block's options, on its own line", lines: ["choose", "  if true then", "    Intro.", "  end", "  * [One]", "  * [Two]", "end"], caret: 3, shows: action("Intro.") },
  { shape: "a divert between the caret and the next beat", lines: ["Before.", "-> elsewhere"], tail: ["scene elsewhere", "  Arrived.", "end"], caret: 2, shows: action("Arrived.") },
  { shape: "a function call between the caret and the next beat", lines: ["Before.", "x = twice(2)", "After."], tail: ["function twice(n)", "  return n * 2", "end"], caret: 2, shows: action("After.") },
  { shape: "a loop between the caret and the next beat", lines: ["Before.", "for i = 1, 2 do", "  Looping.", "end", "After."], caret: 2, shows: action("Looping.") },
  { shape: "a tunnel between the caret and the next beat", lines: ["Before.", "-> aside ->", "After."], tail: ["scene aside", "  Aside.", "  ->->", "end"], caret: 2, shows: action("Aside.") },
  { shape: "a false branch between the caret and the next beat", lines: ["Before.", "if false then", "  Hidden.", "end", "After."], caret: 2, shows: action("After.") },
  { shape: "an else after an empty arm", lines: ["Before.", "if true then", "else", "  Hidden.", "end", "After."], caret: 2, shows: action("After.") },
  { shape: "a loop that runs no times", lines: ["Before.", "for i = 1, 0 do", "  Looping.", "end", "After."], caret: 2, shows: action("After.") },
  { shape: "a break out of a loop before its beat", lines: ["Before.", "for i = 1, 2 do", "  break", "  Looping.", "end", "After."], caret: 2, shows: action("After.") },
  { shape: "a thread between the caret and the next beat", lines: ["Before.", "<- aside", "After."], tail: ["scene aside", "  Aside.", "end"], caret: 2, shows: action("Aside.") },
  { shape: "a tunnel that returns with no beat", lines: ["Before.", "-> aside ->", "After."], tail: ["scene aside", "  ->->", "end"], caret: 2, shows: action("After.") },
  { shape: "a tunnel that returns elsewhere", lines: ["Before.", "-> aside ->", "After."], tail: ["scene aside", "  ->-> elsewhere", "end", "scene elsewhere", "  Arrived.", "end"], caret: 2, shows: action("Arrived.") },
  { shape: "a divert to a label in another scene", lines: ["Before.", "-> other.inner"], tail: ["scene other", "  Outer.", "  branch inner", "    Inner.", "  end", "end"], caret: 2, shows: action("Inner.") },
  { shape: "a tunnel to a label in another scene", lines: ["Before.", "-> other.inner ->", "After."], tail: ["scene other", "  Outer.", "  branch inner", "    Inner.", "    ->->", "  end", "end"], caret: 2, shows: action("Inner.") },
  { shape: "a divert stored in a variable", head: ["store target = -> elsewhere"], lines: ["Before.", "-> target"], tail: ["scene elsewhere", "  Arrived.", "end"], caret: 3, shows: action("Arrived.") },
  { shape: "a scene's closing end after a nested branch", lines: ["Outer.", "branch nested", "  Inner.", "end", "x = 1", "", "After."], caret: 8, shows: action("After.") },
  { shape: "a condition that reads a variable set earlier on the route", head: ["store x = 0"], lines: ["x = 1", "Before.", "if x == 1 then", "  Set.", "else", "  Unset.", "end"], caret: 4, shows: action("Set.") },
];

const describedWords = (described: ShownBeatDescription) =>
  [described?.words ?? "", described?.speaker ?? "", ...(described?.options ?? [])].filter(
    (words) => words.length > 0,
  );

describe("the strip shows what the player describes for the beat it displays", () => {
  test.each(ROWS)(
    "$shape",
    async (row) => {
      const { described, picture, strip } = await previewAt(scriptOf(row), row.caret);
      expect(described, "the player describes the beat it displays").not.toBeNull();
      for (const words of describedWords(described)) {
        expect(picture, "the picture shows the described words").toContain(words);
      }
      expect(strip.preview, "the strip holds the player's description").toEqual(described);
      expect({ label: strip.label, words: strip.words }).toEqual(copyOf(row.shows));
    },
    120_000,
  );
});

describe("the strip follows the picture where the syntax says otherwise", () => {
  test("a glued continuation keeps its speaker and its earlier words", async () => {
    const { described, picture, strip } = await previewAt(
      "scene start\n  ALICE: First. ..\n  .. Second.\nend\n",
      2,
    );
    expect(picture).toContain("First. Second.");
    expect(described).toEqual({ kind: "dialogue", speaker: "ALICE", words: "First. Second." });
    expect({ label: strip.label, words: strip.words }).toEqual({
      label: "ALICE",
      words: "First. Second.",
    });
  }, 120_000);

  test("a speaker's name reads as the picture writes it, its text commands carried out", async () => {
    const { described, picture, strip } = await previewAt(
      'define KING as character with\n  name = "King <wait 1s>Arthur"\nend\n\nscene start\n  KING: Hail!\nend\n',
      5,
    );
    expect(picture).toContain("King Arthur");
    expect(described).toEqual({ kind: "dialogue", speaker: "King Arthur", words: "Hail!" });
    expect({ label: strip.label, words: strip.words }).toEqual({ label: "KING ARTHUR", words: "Hail!" });
  }, 120_000);

  test("a beat that is only a write line describes no words, so the strip is blank", async () => {
    const { described, strip } = await previewAt(
      "scene start\n  Rain falls.\n  @clock: 12:00\n  The door opens.\nend\n",
      2,
    );
    expect(described).toEqual({ kind: null, words: "" });
    expect({ label: strip.label, words: strip.words }).toEqual({ label: "", words: "" });
  }, 120_000);

  test("a story line after a write line describes only its own story text", async () => {
    const { described, picture, strip } = await previewAt(
      "scene start\n  @clock: 12:00\n  Rain falls.\nend\n",
      2,
    );
    expect(picture).toContain("Rain falls.");
    expect(described).toEqual({ kind: "action", words: "Rain falls." });
    expect({ label: strip.label, words: strip.words }).toEqual({ label: "ACTION", words: "Rain falls." });
  }, 120_000);

  test("story text glued after a write line is written into the write line's target, so it is not story words", async () => {
    const { described, strip } = await previewAt(
      "scene start\n  @clock: 12:00 ..\n  .. Rain falls.\nend\n",
      2,
    );
    expect(described).toEqual({ kind: null, words: "" });
    expect({ label: strip.label, words: strip.words }).toEqual({ label: "", words: "" });
  }, 120_000);

  test("a menu without a caption lists only the options a condition lets through", async () => {
    const { described, picture, strip } = await previewAt(
      "scene start\n  choose\n    if false then\n      * [Hidden]\n    end\n    * [Shown]\n  end\nend\n",
      1,
    );
    expect(picture).not.toContain("Hidden");
    expect(described).toEqual({ kind: "choice", words: "", options: ["Shown"] });
    expect({ label: strip.label, words: strip.words }).toEqual({ label: "CHOOSE", words: "Shown" });
  }, 120_000);

  test("a completion preview's strip follows the suggested text and returns to the document's when it ends", async () => {
    const text = "scene start\n  Original.\nend\n";
    const h = await harnessAt(text, 1);
    try {
      expect((await stripFor(text, 1, h.toEditor)).words).toBe("Original.");
      await h.suggest(
        [{ range: { start: { line: 1, character: 2 }, end: { line: 1, character: 11 } }, text: "Suggested." }],
        1,
      );
      expect(lastGameState(h.toEditor)?.completion?.status).toBe("showing");
      expect(pictureOf(h.toRouter)).toContain("Suggested.");
      expect(await stripFor(text, 1, h.toEditor)).toMatchObject({
        label: "ACTION",
        words: "Suggested.",
      });
      await h.closeSuggestions();
      expect(lastGameState(h.toEditor)?.completion).toBeNull();
      expect(await stripFor(text, 1, h.toEditor)).toMatchObject({
        label: "ACTION",
        words: "Original.",
      });
    } finally {
      h.dispose();
    }
  }, 120_000);
});

describe("the strip shows no beat's words when the picture shows none", () => {
  test.each([
    { shape: "a scene with no beat", text: "scene start\nend\n", caret: 0, shows: { kind: "empty" }, ending: "out" },
    { shape: "a line outside every scene", text: "Loose words.\n\nscene start\n  Hello.\nend\n", caret: 0, shows: { kind: "empty" } },
    { shape: "a definition", text: "define harbor with\n  color = \"blue\"\nend\n\nscene start\n  Hello.\nend\n", caret: 1, shows: { kind: "setup" } },
    { shape: "an error ending", text: "scene start\n  {error(\"boom\")} After.\nend\n", caret: 1, shows: { kind: "empty" }, ending: "error" },
  ])(
    "$shape",
    async ({ text, caret, shows, ending = null }) => {
      const { described, picture, strip, ending: ended } = await previewAt(text, caret);
      expect({ ending: ended, described, picture, preview: strip.preview }).toEqual({
        ending,
        described: null,
        picture: "",
        preview: shows,
      });
    },
    120_000,
  );
});

