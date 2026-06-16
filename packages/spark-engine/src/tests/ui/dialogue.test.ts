// Golden-master: dialogue rendering (the highest-volume UI path).
//
// Locks the CURRENT pre-refactor behavior: the engine turns a typewriter
// TextInstruction[] into a per-glyph DOM sub-tree (text_line / text_word /
// text_space / text_letter) with a per-letter reveal `ui/animate`. §9.1.1 of
// the reactive spec proposes relocating this to the renderer; until then,
// THIS stream is the baseline.
//
// Two driving modes:
//  - preview()  → the real INSTANT screen-construction + reveal path.
//  - jumpTo("start") + nextBeat() + display(beat, false) → an ANIMATED beat
//    fanned out exactly as Coordinator.display() does, using the *real*
//    interpreter Instructions.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

screen main with
  textbox:
    character_info:
      character_name:
        text
      character_parenthetical:
        text
    dialogue:
      text
end
`;

function story(body: string) {
  return `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

describe("dialogue", () => {
  test("animated dialogue line (per-glyph create + per-letter animate)", async () => {
    const harness = createHarness(story(`  HERO: Hi.`));
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    expect(beat).toBeTruthy();
    await harness.display(beat!, /* instant */ false);
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("instant dialogue line (no per-letter timing)", async () => {
    const harness = createHarness(story(`  HERO: Hi.`));
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, /* instant */ true);
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("character name + parenthetical routing", async () => {
    const harness = createHarness(story(`  HERO (cheerfully): Hi there.`));
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    // The real interpreter output drives the targets — lock the routing.
    expect(Object.keys(beat?.text ?? {}).sort()).toMatchSnapshot("text-targets");
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot("messages");
  });

  test("inline-styled chunks (bold / italic)", async () => {
    const harness = createHarness(
      story(`  HERO: This is **bold** and *italic* text.`),
    );
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("multi-line dialogue with whitespace + centered alignment", async () => {
    const harness = createHarness(
      story(`  HERO: Line one.\n  ^Centered line.^`),
    );
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });
});
