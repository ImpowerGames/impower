import { describe, expect, test } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const LAYOUT = `layout main {
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
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
