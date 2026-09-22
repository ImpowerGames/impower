// A spaced `>` break ends a beat that waits for a click, even when the beat
// has no text: a line holding only `>` shows its box empty, and a picture line
// ending in `>` shows the picture and waits, rather than folding into the next
// line's beat.

import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define BG as image with
  src = "https://example.com/bg.png"
end

layout main with
  stage:
    backdrop:
      image
  textbox:
    character_info:
      character_name:
        text
    dialogue:
      text
    action:
      text
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

/** Every character a beat types into its body, leaving out the cue. */
const typed = (beat: any): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !target.startsWith("character_"))
    .flatMap(([, events]) => events as any[])
    .map((event: any) => event.text ?? "")
    .join("");

/** Whether the beat, just shown, would move on without a click. */
const advancesByItself = (harness: any, beat: any): boolean =>
  new Coordinator(harness.game, beat).shouldContinue() > 0;

describe("spaced `>` break", () => {
  test("a lone `>` shows an empty box and waits for a click", async () => {
    const harness = createHarness(
      story(`  HERO: Hi.\n  >\n  HERO: Bye.`),
    );
    await harness.ready;
    harness.jumpTo("start");
    expect(typed(harness.nextBeat())).toBe("Hi.");

    const pause = harness.nextBeat();
    expect(pause?.text).toBeDefined();
    expect(typed(pause)).toBe("");
    expect(advancesByItself(harness, pause)).toBe(false);
    harness.reset();
    await harness.display(pause!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();

    expect(typed(harness.nextBeat())).toBe("Bye.");
  });

  test("a picture line ending in `>` shows the picture and waits", async () => {
    const harness = createHarness(
      story(`  [[show backdrop BG]] >\n  Next.`),
    );
    await harness.ready;
    harness.jumpTo("start");

    const picture = harness.nextBeat();
    expect(picture?.image).toBeDefined();
    expect(typed(picture)).toBe("");
    expect(advancesByItself(harness, picture)).toBe(false);

    expect(typed(harness.nextBeat())).toBe("Next.");
  });
});
