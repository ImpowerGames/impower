import { describe, expect, test } from "vitest";
import type { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../spark-engine/src/game/core/classes/Coordinator";
import {
  createDOMHarness,
  flushMicrotasks,
  type DOMHarness,
} from "./domTestHarness";

const STORY = `define RAFFLES as character with
  name = "RAFFLES"
end

layout phone {
  thread {
    stream {
      dialogue.bubble { text; continue_indicator }
    }
  }
  continue_indicator
}

scene start
  [[open phone]]
  RAFFLES: slight problem
  RAFFLES: doors locked
  RAFFLES: let me think
end
`;

const WAITING = "opacity 0, transition none";
const FINISHED = "opacity 1, transition unset";

type IndicatorPresenter = {
  finish(): void;
  writeIndicator(instant?: boolean): void;
};

async function show(h: DOMHarness) {
  const beat = h.nextBeat();
  expect(beat).toBeDefined();
  const coordinator = new Coordinator(h.game, beat!);
  coordinator.onUpdate({ deltaMS: 0 } as Clock);
  await flushMicrotasks(30);
  const presenters = (
    coordinator as unknown as { _presenters: IndicatorPresenter[] }
  )._presenters;
  return {
    async type() {
      for (const presenter of presenters) {
        presenter.writeIndicator(false);
      }
      await flushMicrotasks(30);
    },
    async finish() {
      for (const presenter of presenters) {
        presenter.finish();
      }
      await flushMicrotasks(30);
    },
  };
}

const indicator = (el: HTMLElement) =>
  `opacity ${el.style.opacity}, transition ${el.style.transition || "unset"}`;

const entryIndicators = (h: DOMHarness) =>
  [
    ...h.overlay.querySelectorAll<HTMLElement>(
      ".phone .stream > * > .continue_indicator",
    ),
  ].map(indicator);

const outsideIndicator = (h: DOMHarness) =>
  indicator(
    h.overlay.querySelector<HTMLElement>(".phone > .continue_indicator")!,
  );

describe("the continue indicator in a stream entry (#2788)", () => {
  test("only the entry waiting for the click is written; earlier entries keep their finished state", async () => {
    const h = createDOMHarness(STORY, 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");

    await show(h);
    const second = await show(h);
    expect(entryIndicators(h)).toEqual([FINISHED, FINISHED]);
    expect(outsideIndicator(h)).toBe(FINISHED);

    await second.type();
    expect(entryIndicators(h)).toEqual([FINISHED, WAITING]);
    expect(outsideIndicator(h)).toBe(WAITING);

    await second.finish();
    expect(entryIndicators(h)).toEqual([FINISHED, FINISHED]);
    expect(outsideIndicator(h)).toBe(FINISHED);

    const third = await show(h);
    await third.type();
    expect(entryIndicators(h)).toEqual([FINISHED, FINISHED, WAITING]);
    expect(outsideIndicator(h)).toBe(WAITING);
  });

  test("a loaded game shows each entry's indicator as it was saved", async () => {
    const h = createDOMHarness(STORY, 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");
    await show(h);
    const second = await show(h);
    await second.type();
    expect(entryIndicators(h)).toEqual([FINISHED, WAITING]);

    const loaded = createDOMHarness(STORY, 0, {
      reactive: true,
      autoOpenAll: false,
      loadCheckpoint: h.game.save(),
    });
    await loaded.ready;
    await flushMicrotasks(30);
    expect(entryIndicators(loaded)).toEqual([FINISHED, WAITING]);
  });

  test("the ending hides the indicator on every entry", async () => {
    const h = createDOMHarness(STORY, 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");
    await show(h);
    const second = await show(h);
    await second.type();
    (h.game as unknown as { endStory(kind: string): void }).endStory("fin");
    await flushMicrotasks(30);
    const displays = (harness: DOMHarness) =>
      [
        ...harness.overlay.querySelectorAll<HTMLElement>(
          ".phone .continue_indicator",
        ),
      ].map((el) => el.style.display);
    expect(displays(h)).toEqual(["none", "none", "none"]);

    const loaded = createDOMHarness(STORY, 0, {
      reactive: true,
      autoOpenAll: false,
      loadCheckpoint: h.game.save(),
    });
    await loaded.ready;
    await flushMicrotasks(30);
    expect(displays(loaded)).toEqual(["none", "none", "none"]);
  });
});
