// A layout's binding is evaluated by the story (`EvaluateFunction`), between
// two of the story's own instructions. The story's next choice reads the flow
// it leaves from where the story last ran (`previousFlow`), and counts the
// flows it enters by it. An evaluation that left that state moved made a
// refresh during play change the next choice's visit count (#657).

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const STORY = `store stamp = 7

layout main with
  badge {
    text "{stamp}"
  }
  choice.0 {
    text
  }
  dialogue {
    text
  }
end

-> start

scene start
  Before.
  choose
    * Go on
      The scene was visited {count.visits(-> start)} times.
  end
end
`;

/** The visits the line after the choice reads, with or without a refresh of
 *  every binding while the menu waits. */
async function visitsAfterChoice(refresh: boolean): Promise<string> {
  const harness = createHarness(STORY);
  await harness.ready;
  harness.jumpToFlow("start");
  harness.reset();
  let beat = harness.nextBeat();
  while (beat && !beat.choices?.length) {
    await harness.display(beat, true);
    beat = harness.nextBeat();
  }
  expect(beat?.choices).toEqual(["choice 0"]);
  await harness.display(beat!, true);
  await flushMicrotasks();
  if (refresh) {
    // Every binding is evaluated again, as a refresh after a change does.
    const ui = harness.game.module.ui as any;
    ui._refreshAll = true;
    ui.refreshLayouts();
  }
  const [choice] = harness.observedElementIds();
  harness.emitEvent("click", choice!, { button: 0 });
  await flushMicrotasks();
  const after = harness.nextBeat();
  // The beat's text, letter by letter as the typewriter shows it.
  const letters = Object.values(after?.text ?? {})
    .flat()
    .map((event: any) => event?.text ?? "")
    .join("");
  const shown = letters.match(/visited \d+ times/);
  return shown?.[0] ?? letters;
}

describe("a binding evaluated while a menu waits", () => {
  test("leaves the next choice's visit count what it is without the evaluation", async () => {
    const without = await visitsAfterChoice(false);
    expect(without).toBe("visited 1 times");
    expect(await visitsAfterChoice(true)).toBe(without);
  });
});
