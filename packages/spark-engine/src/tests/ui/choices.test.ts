import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `layout main with
  dialogue {
    text
  }
  choice.0 {
    text
  }
  choice.1 {
    text
  }
  choice.2 {
    text
  }
end
`;

const CHOICE_STORY = `${SCREEN}


scene start
  choose
    Pick a fruit:
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
    harness.jumpToFlow("start");
    harness.reset();
    const beat = harness.nextBeat();
    expect(beat?.choices).toEqual(["choice 0", "choice 1", "choice 2"]);
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();
  });

  test("click first choice → clear + advance round-trip", async () => {
    const harness = createHarness(CHOICE_STORY);
    await harness.ready;
    harness.jumpToFlow("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();

    const observed = harness.observedElementIds();
    expect(observed.length).toBe(3);

    harness.reset();
    harness.emitEvent("click", observed[0]!, { button: 0 });
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot("ui-after-click");
    expect(
      harness.messages.some((m) => m.method === "game/chosePathToContinue"),
    ).toBe(true);
  });
});
