// Golden-master: choices rendering + a click → EventMessage round-trip.
//
// The interpreter emits one text target per choice (`choice 0`, `choice 1`, …)
// and lists them in `instructions.choices`. `Coordinator.display()` writes each
// choice's text and registers a `click` observer per choice; clicking fires an
// EventMessage back into the engine, which clears the choices and advances the
// story via `chosePathToContinue(index)`. This locks BOTH the render stream and
// the post-click clear+advance stream.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `screen main with
  dialogue:
    text
  choice 0:
    text
  choice 1:
    text
  choice 2:
    text
end
`;

const CHOICE_STORY = `${SCREEN}
-> start

scene start
  Pick a fruit:
  choose
    + (a) Apple
      You chose apple.
      -> DONE
    + (b) Banana
      You chose banana.
      -> DONE
    + (c) Cherry
      You chose cherry.
      -> DONE
  end
end
`;

describe("choices", () => {
  test("N choices render (text + per-choice observe)", async () => {
    const harness = createHarness(CHOICE_STORY);
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    expect(beat?.choices).toEqual(["choice 0", "choice 1", "choice 2"]);
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot();
  });

  test("click first choice → clear + advance round-trip", async () => {
    const harness = createHarness(CHOICE_STORY);
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();

    const observed = harness.observedElementIds();
    expect(observed.length).toBe(3);

    // Click choice 0; capture only what the round-trip produces.
    harness.reset();
    harness.emitEvent("click", observed[0]!, { button: 0 });
    await flushMicrotasks();
    expect(harness.snapshotFiltered("ui/")).toMatchSnapshot("ui-after-click");
    // The story advanced (chosePathToContinue fired).
    expect(
      harness.messages.some((m) => m.method === "game/chosePathToContinue"),
    ).toBe(true);
  });
});
