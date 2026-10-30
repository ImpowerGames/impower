import { type Clock } from "@impower/spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

const SCREEN = `define a as image with
  src = "https://example.com/a.png"
end

define b as image with
  src = "https://example.com/b.png"
end
`;

const source = (picture: string, words: string) => `${SCREEN}


scene start
  The rain has not let up.

  HERO:
    [[${picture}]]
    Do you understand?

  HERO:
    ${words}
end
`;

const BEFORE = source("a", "Do you know?");

const lineOf = (src: string, text: string) =>
  src.split("\n").findIndex((l) => l.includes(text));

const ACTION_LINE = lineOf(BEFORE, "The rain has not let up.");
const DIALOGUE_LINE = lineOf(BEFORE, "Do you understand?");
const NEXT_LINE = lineOf(BEFORE, "Do you know?");

function displayed(el: Element | null, overlay: HTMLElement): boolean {
  if (!el) {
    return false;
  }
  for (let n: Element | null = el; n && n !== overlay; n = n.parentElement) {
    if ((n as HTMLElement).style.display === "none") {
      return false;
    }
  }
  return true;
}

type Frame = ReturnType<typeof frame>;

function frame(overlay: HTMLElement) {
  const text = (selector: string) => {
    const el = overlay.querySelector(selector);
    return el && displayed(el, overlay)
      ? (el.querySelector(":scope > .text")?.textContent ?? "")
      : "";
  };
  const portrait = overlay.querySelector(".portrait");
  return {
    textbox: displayed(overlay.querySelector(".textbox"), overlay),
    dialogue: text(".dialogue"),
    name: text(".character_name"),
    action: text(".action"),
    portrait:
      portrait && displayed(portrait, overlay)
        ? Array.from(
            portrait.querySelectorAll(":scope > .image > .instance[image]"),
          ).map((l) => l.getAttribute("image"))
        : [],
  };
}

async function previewing(line = DIALOGUE_LINE, src = BEFORE) {
  const frames: Frame[] = [];
  let recording = false;
  const h = createDOMHarness(src, line, {
    compose: true,
    afterEachMessage: () => {
      if (recording) {
        frames.push(frame(h.overlay));
      }
    },
  });
  await h.ready;
  await h.rerender(src, line);
  await flushMicrotasks(10);
  return {
    h,
    frames,
    record: (on: boolean) => {
      recording = on;
    },
  };
}

function mixed(seen: Frame[], before: Frame, after: Frame) {
  const same = (a: Frame, b: Frame) => JSON.stringify(a) === JSON.stringify(b);
  return seen.flatMap((f, i) =>
    same(f, before) || same(f, after)
      ? []
      : [`message ${i}: ${JSON.stringify(f)}`],
  );
}

const SPOKEN = {
  textbox: true,
  dialogue: "Do you understand?",
  name: "HERO",
  action: "",
  portrait: ["a"],
};

const ACTION = {
  textbox: true,
  dialogue: "",
  name: "",
  action: "The rain has not let up.",
  portrait: [],
};

describe("redrawing the preview keeps the beat on screen (#1820)", () => {
  test("the dialogue beat is on screen before the edit", async () => {
    const { h } = await previewing();
    expect(frame(h.overlay)).toEqual(SPOKEN);
  });

  test("an edited dialogue line shows the old beat or the new one in every frame", async () => {
    const { h, frames, record } = await previewing(NEXT_LINE);
    const before = frame(h.overlay);
    const edited = source("a", "Do you see?");

    record(true);
    await h.rerender(edited, lineOf(edited, "Do you see?"));
    record(false);

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, dialogue: "Do you see?" });
    expect(frames.length).toBeGreaterThan(0);
    expect(mixed(frames, before, after)).toEqual([]);
  });

  test("a changed portrait shows the old beat or the new one in every frame, never both pictures", async () => {
    const { h, frames, record } = await previewing();
    const before = frame(h.overlay);
    const edited = source("b", "Do you know?");

    record(true);
    await h.rerender(edited, DIALOGUE_LINE);
    record(false);

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, portrait: ["b"] });
    expect(mixed(frames, before, after)).toEqual([]);
  });

  test("the name stays up from one dialogue beat to the next", async () => {
    const { h, frames, record } = await previewing();
    const before = frame(h.overlay);

    record(true);
    await h.rerender(BEFORE, NEXT_LINE);
    record(false);

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, dialogue: "Do you know?", portrait: [] });
    expect(frames.filter((f) => f.name !== "HERO")).toEqual([]);
    expect(mixed(frames, before, after)).toEqual([]);
  });

  test("a beat that leaves the box empty takes it away in the same frame as it shows its own", async () => {
    const { h, frames, record } = await previewing();
    const before = frame(h.overlay);

    record(true);
    await h.rerender(BEFORE, ACTION_LINE);
    record(false);

    expect(frame(h.overlay)).toEqual(ACTION);
    expect(mixed(frames, before, ACTION)).toEqual([]);
  });

  test("scrubbing from the action to the dialogue shows one beat or the other in every frame", async () => {
    const { h, frames, record } = await previewing(ACTION_LINE);
    const before = frame(h.overlay);
    expect(before).toEqual(ACTION);

    record(true);
    await h.rerender(BEFORE, DIALOGUE_LINE);
    record(false);

    expect(frame(h.overlay)).toEqual(SPOKEN);
    expect(mixed(frames, before, SPOKEN)).toEqual([]);
  });

  test("after a display taken over before its sweep, the next one still shows the old beat or the new one in every frame", async () => {
    const { h, frames, record } = await previewing();
    const before = frame(h.overlay);
    const edited = source("b", "Do you know?");

    record(true);
    await h.rerender(BEFORE, DIALOGUE_LINE, { connectOnly: true });
    await h.rerender(edited, DIALOGUE_LINE);
    record(false);

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, portrait: ["b"] });
    expect(mixed(frames, before, after)).toEqual([]);
  });

  test("while the display waits for its beat, the page still shows the last one", async () => {
    const { h } = await previewing();
    const before = frame(h.overlay);
    let between: Frame | undefined;

    await h.rerender(source("b", "Do you see?"), DIALOGUE_LINE, {
      afterConnect: () => {
        between = frame(h.overlay);
      },
    });

    expect(between).toEqual(before);
  });

  test("a display taken over before its sweep puts up nothing, and the next one goes up whole", async () => {
    const { h, frames, record } = await previewing();
    const before = frame(h.overlay);

    record(true);
    await h.rerender(BEFORE, DIALOGUE_LINE, { connectOnly: true });
    await h.rerender(BEFORE, ACTION_LINE);
    record(false);

    expect(frame(h.overlay)).toEqual(ACTION);
    expect(mixed(frames, before, ACTION)).toEqual([]);
  });

  test("a first connect on an empty page hides the empty targets at once", async () => {
    const h = createDOMHarness(BEFORE, DIALOGUE_LINE);
    await h.ready;
    for (const target of [".dialogue", ".character_name", ".portrait"]) {
      expect(displayed(h.overlay.querySelector(target), h.overlay)).toBe(false);
    }
  });
});

const PLAYED = `

scene start
  HERO: Do you understand?

  HERO: Do you know?
end
`;

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

describe("playing the next beat keeps the screen whole (#1820)", () => {
  test("the name stays up from one played dialogue beat to the next", async () => {
    const frames: Frame[] = [];
    let recording = false;
    const h = createDOMHarness(PLAYED, 0, {
      compose: true,
      afterEachMessage: () => {
        if (recording) {
          frames.push(frame(h.overlay));
        }
      },
    });
    await h.ready;
    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(10);
    h.game.context.system.previewing = undefined;
    h.jumpTo("start");
    const play = async () => {
      const beat = h.nextBeat();
      expect(beat).toBeTruthy();
      const coordinator = new Coordinator(h.game, beat!);
      for (let i = 0; i < 10; i += 1) {
        await flushMicrotasks();
        coordinator.onUpdate(tick());
      }
      await flushMicrotasks(10);
      await untilShown(h.overlay);
    };
    await play();
    const before = frame(h.overlay);
    expect(before).toMatchObject({ name: "HERO", dialogue: "Do you understand?" });
    const name = h.overlay.querySelector(".character_name")!;
    const rebuilt: MutationRecord[] = [];
    const win = h.overlay.ownerDocument.defaultView as any;
    const observer = new win.MutationObserver((records: MutationRecord[]) =>
      rebuilt.push(...records),
    );
    observer.observe(name, { childList: true, subtree: true, characterData: true });

    recording = true;
    await play();
    recording = false;
    rebuilt.push(...observer.takeRecords());
    observer.disconnect();

    const after = frame(h.overlay);
    expect(after).toEqual({ ...before, dialogue: "Do you know?" });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.filter((f) => f.name !== "HERO")).toEqual([]);
    expect(rebuilt).toEqual([]);
    expect(mixed(frames, before, after)).toEqual([]);
  });
});
