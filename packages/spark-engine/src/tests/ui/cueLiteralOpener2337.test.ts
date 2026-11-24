import { describe, expect, test } from "vitest";
import ScreenplayParser from "../../../../sparkdown-screenplay/src/classes/ScreenplayParser";
import ScreenplayTypesetter from "../../../../sparkdown-screenplay/src/classes/ScreenplayTypesetter";
import { generateScreenplayReadingCopy } from "../../../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREENPLAY_CASES = [
  ["action", "  Hello ((theme", "Hello ((theme"],
  ["action", "  Hello [[mia", "Hello [[mia"],
  ["dialogue_character", "  NOVA ((:\n    Hey.", "NOVA (("],
  ["dialogue_character", "  NOVA [[:\n    Hey.", "NOVA [["],
] as const;

const printedLines = (source: string, tag: string): string => {
  const tokens = new ScreenplayParser().parse(source);
  return new ScreenplayTypesetter()
    .compose(tokens)
    .flatMap((span) => ("lines" in span ? span.lines : span.tag === "dual" ? [...(span.positions.l ?? []), ...(span.positions.r ?? [])] : []))
    .filter((line) => line.tag === tag)
    .map((line) => line.content.map((run) => run.text).join(""))
    .join("\n")
    .trim();
};

describe("a literal directive opener prints as written in the screenplay (I-2337)", () => {
  test.each(SCREENPLAY_CASES)("%s line `%s` prints `%s`", (tag, line, expected) => {
    expect(printedLines(`scene start\n${line}\nend\n`, tag)).toBe(expected);
  });

  test.each(SCREENPLAY_CASES)("%s line `%s` reads `%s` in the reading copy", (_tag, line, expected) => {
    const copy = generateScreenplayReadingCopy(new ScreenplayParser().parse(`scene start\n${line}\nend\n`));
    expect(copy).toContain(expected);
    expect(copy).not.toContain("\\");
  });
});

const LAYOUT = `layout main {
  textbox {
    character_info {
      character_name #clear {
        text
      }
    }
    dialogue #clear {
      text
    }
  }
}
`;

async function firstBeat(name: string, cue: string, line: string): Promise<Instructions> {
  const defs = `define nova as character with\n  name = "${name}"\nend\n\n${LAYOUT}`;
  const h = createHarness(`${defs}\nscene start\n  ${cue}:\n    ${line}\nend\n`);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  return beat!;
}

const beatText = (beat: Instructions, target: string): string =>
  (beat.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

describe("a literal directive opener in a cue keeps the cue's speaker (I-2337)", () => {
  test.each([
    ["NOVA ((", "NOVA (("],
    ["NOVA [[", "NOVA [["],
  ])("cue `%s:` speaks as the character named `%s`", async (cue, name) => {
    const beat = await firstBeat(name, cue, "Hey.");
    expect(beat.speaker?.character).toBe("nova");
    expect(beatText(beat, "character_name")).toBe(name);
  });

  test("an opener left open in the spoken line stays text", async () => {
    const beat = await firstBeat("NOVA", "NOVA", "Hey ((play music theme");
    expect(beat.speaker?.character).toBe("nova");
    expect(beatText(beat, "dialogue")).toBe("Hey ((play music theme");
  });
});
