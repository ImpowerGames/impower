import { describe, expect, test } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import { renderedBeat, script } from "./harness/displayStyleHarness";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const MIA = `define mia as character with
  name = "MIA"
end
`;

async function spokenBeat(line: string): Promise<Instructions> {
  const h = createHarness(`${MIA}\n\nscene start\n  MIA:\n    ${line}\nend\n`, 0);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  h.game.destroy();
  return beat!;
}

const afterTimes = (beat: Instructions) =>
  (beat.text?.["dialogue"] ?? []).map((event) => event.after ?? 0);

const dialogueText = (beat: Instructions) =>
  (beat.text?.["dialogue"] ?? []).map((event) => event.text).join("");

describe("a tag's value follows an equals sign (#2391)", () => {
  test("<speed=0.5> types the rest of the line at half speed", async () => {
    const slowed = afterTimes(await spokenBeat("<speed=0.5>Come closer"));
    const plain = afterTimes(await spokenBeat("Come closer"));
    expect(slowed.length).toBe(plain.length);
    expect(plain.at(-1)).toBeGreaterThan(0);
    expect(slowed.at(-1)! / plain.at(-1)!).toBeCloseTo(2);
  });

  test("<wait=1> pauses the line for a second", async () => {
    const waited = afterTimes(await spokenBeat("Hello <wait=1>there"));
    const plain = afterTimes(await spokenBeat("Hello there"));
    expect(waited.at(-1)! - plain.at(-1)!).toBeCloseTo(1);
  });

  test("<p=2> changes the voice's pitch and leaves the text alone", async () => {
    const raised = await spokenBeat("<p=2>Hello there");
    const plain = await spokenBeat("Hello there");
    expect(dialogueText(raised)).toBe("Hello there");
    expect(JSON.stringify(raised.audio)).not.toBe(JSON.stringify(plain.audio));
    expect(JSON.stringify(raised.audio)).toBe(JSON.stringify((await spokenBeat("<pitch=2>Hello there")).audio));
  });

  test("<color=red> colours the text it encloses", async () => {
    const { beat } = await renderedBeat(script("A <color=red>word</color> here."));
    const styled = (beat.text?.["action"] ?? []).filter((event) => event.style?.["text-color"] === "red");
    expect(styled.map((event) => event.text).join("")).toBe("word");
  });
});

describe("a tag written with a colon is an unknown tag (#2391)", () => {
  test("<speed:0.5> is absent from the text and changes nothing", async () => {
    const tagged = await spokenBeat("<speed:0.5>Come closer");
    const plain = await spokenBeat("Come closer");
    expect(dialogueText(tagged)).toBe("Come closer");
    expect(afterTimes(tagged)).toEqual(afterTimes(plain));
  });
});
