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
    const ui = harness.game.module.ui as any;
    ui._refreshAll = true;
    ui.refreshLayouts();
  }
  const [choice] = harness.observedElementIds();
  harness.emitEvent("click", choice!, { button: 0 });
  await flushMicrotasks();
  const after = harness.nextBeat();
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
