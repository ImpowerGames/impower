import { createSparkdownParser } from "@impower/sparkdown/src/compiler/utils/createSparkdownParser";
import { readCue, type CueReading } from "@impower/sparkdown/src/compiler/utils/readCue";
import { compareEngines } from "@impower/sparkdown/src/tests/compiler/scopeEquality";
import { beforeAll, describe, expect, test } from "vitest";
import type { Cue } from "../../game/modules/interpreter/classes/InterpreterModule";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

const CHARACTERS = ["raffles", "bunny", "_x"];

const CUES: readonly (readonly [label: string, cue: string])[] = [
  ["a shown name alone", "???"],
  ["a speaker", "??? as raffles"],
  ["a speaker and a parenthetical", "??? as raffles (O.S.)"],
  ["every part", "??? as raffles (O.S.) [<]"],
  ["a speaker and a position", "??? as bunny [>]"],
  ["a shown name with spaces and punctuation", "Mr. Smith, Jr.! as raffles"],
  ["another character's name as the shown name", "BUNNY as raffles"],
  ["the escaped `as`", "Dressed \\as santa"],
  ["the escaped `as` before a speaker", "Dressed \\as santa as bunny"],
  ["the last `as` names the speaker", "A as b as raffles"],
  ["several spaces and tabs around `as`", "???  as\traffles  (O.S.)  [<]"],
  ["a speaker that names no character", "??? as stranger"],
  ["a speaker with an underscore", "??? as _x"],
  ["a speaker with an `@` part", "??? as raffles@shy"],
  ["a keyword after `as`", "??? as end"],
  ["a number after `as`", "??? as 3d"],
  ["`as` with nothing after it", "RAFFLES as"],
  ["`as` with nothing before it", "as raffles"],
  ["uppercase `AS`", "??? AS raffles"],
  ["`as` inside a word", "Basil asraffles"],
  ["a word after the speaker", "??? as raffles today"],
  ["punctuation after the speaker", "??? as raffles."],
  ["a parenthetical touching the speaker", "??? as raffles(O.S.)"],
  ["two parentheticals", "Mia (cont'd) (O.S.)"],
  ["a position without a parenthetical", "Mia [<]"],
  ["an empty position", "Mia []"],
  ["a position with spaces inside", "Mia [ > ]"],
  ["a tag after the speaker", "??? as raffles # note"],
];

const ROWS = CUES.flatMap(([label, cue]) => [
  [`${label}, block`, cue, "block"] as const,
  [`${label}, inline`, cue, "inline"] as const,
]);

const DEFS = CHARACTERS.map((name) => `define ${name} as character with\nend\n`).join("\n");

const rowLines = ROWS.flatMap(([, cue, form]) => (form === "block" ? [`  ${cue}:`, "    Hello."] : [`  ${cue}: Hello.`]));

const scene = ["scene start", ...rowLines, "end", ""].join("\n");

const source = `${DEFS}\n${scene}`;

const sceneFrom = source.indexOf("scene start");

const cueLineStarts: number[] = [];
{
  let at = sceneFrom + "scene start\n".length;
  for (const [, , form] of ROWS) {
    cueLineStarts.push(at + 2);
    const lines = form === "block" ? 2 : 1;
    for (let n = 0; n < lines; n += 1) at = source.indexOf("\n", at) + 1;
  }
}

type Coloured = readonly [from: number, word: string];

const COLOURED_ROLES: Readonly<Record<string, string>> = {
  DialogueCharacterName: "name",
  DialogueCharacterAsKeyword: "as",
  DialogueCharacterSpeaker: "speaker",
  DialogueCharacterParenthetical: "parenthetical",
  DialogueCharacterPositionContent: "position",
};

const inOrder = (words: Coloured[]) => [...words].sort((a, b) => a[0] - b[0]).map(([from, word]) => `${from} ${word}`);

function grammarColouring(): string[][] {
  const tree = createSparkdownParser().parse(source);
  const rows: Coloured[][] = ROWS.map(() => []);
  tree.iterate({
    from: sceneFrom,
    enter: (node) => {
      const role = Object.hasOwn(COLOURED_ROLES, node.name) ? COLOURED_ROLES[node.name] : undefined;
      if (!role) return undefined;
      let row = cueLineStarts.length - 1;
      while (row > 0 && cueLineStarts[row]! > node.from) row -= 1;
      const raw = source.slice(node.from, node.to);
      const lead = raw.length - raw.trimStart().length;
      rows[row]!.push([node.from + lead - cueLineStarts[row]!, `${role} ${raw.trim()}`]);
      return false;
    },
  });
  return rows.map(inOrder);
}

function readingColouring(reading: CueReading): string[] {
  const words: Coloured[] = [];
  const colour = (role: string, part: { from: number; text: string } | undefined) => {
    if (part) words.push([part.from, `${role} ${part.text}`]);
  };
  colour("name", reading.name);
  colour("as", reading.as);
  colour("speaker", reading.speaker);
  colour("parenthetical", reading.parenthetical);
  colour("position", reading.position);
  return inOrder(words);
}

const expectedCue = (reading: CueReading): Cue => {
  const position = reading.position?.text ?? "";
  const cue: Cue = {
    name: reading.name.text,
    parenthetical: reading.parenthetical?.text ?? "",
    position: position === "<" ? "left" : position === ">" ? "right" : position,
  };
  if (reading.speaker && CHARACTERS.includes(reading.speaker.text)) cue.character = reading.speaker.text;
  return cue;
};

let grammar: string[][] = [];
const resolved: (Cue | undefined)[] = [];

beforeAll(async () => {
  grammar = grammarColouring();
  const harness = createHarness(source);
  await harness.ready;
  const interpreter = (harness.game.module as any).interpreter;
  const seen: Cue[] = [];
  const resolveCue = interpreter.resolveCue.bind(interpreter);
  interpreter.resolveCue = (text: string) => {
    const cue = resolveCue(text);
    seen.push(cue);
    return cue;
  };
  harness.jumpToFlow("start");
  await flushMicrotasks(10);
  for (let i = 0; i < ROWS.length; i += 1) {
    const before = seen.length;
    harness.nextBeat();
    resolved.push(seen[before]);
  }
});

describe("the grammar splits a cue as the game reads it (#2283)", () => {
  test.each(ROWS.map(([label, cue], i) => [label, cue, i] as const))("%s: `%s:`", (_label, cue, i) => {
    expect(grammar[i]).toEqual(readingColouring(readCue(cue)));
  });

  test.each(ROWS.map(([label, cue], i) => [label, cue, i] as const))(
    "the engine resolves the cue the compiler hands it as the reading splits it, %s: `%s:`",
    (_label, cue, i) => {
      expect(resolved[i]).toEqual(expectedCue(readCue(cue)));
    },
  );

  test("the VS Code grammar colours the table as the editor's tree does", async () => {
    expect(await compareEngines(source)).toEqual([]);
  });
});
