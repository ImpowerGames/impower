// The page applies a composed `ui/beat` (#1820) in one handler: its
// structural ops, then the final content of every target it touches, deduped
// against the live DOM at that moment, then its sweep. A played beat commits
// at the instant its text starts revealing. The maintainer's rule: the old
// beat stays fully visible until that instant, and at that same instant the
// targets the new beat does not write are emptied and the written ones
// replaced.

import { BeatMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { afterEach, describe, expect, test, vi } from "vitest";
import AssetManager from "../../app/managers/AssetManager";
import {
  createDOMHarness,
  createStubApp,
  flushMicrotasks,
} from "./domTestHarness";

const SOURCE = `-> start

scene start
  HERO: Do you understand?
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("Do you understand?"));

/** A page showing the dialogue beat, as a composed preview leaves it. */
async function showing(src = SOURCE, line = LINE) {
  const h = createDOMHarness(src, line, { compose: true });
  await h.ready;
  await h.rerender(src, line);
  await flushMicrotasks(10);
  const dialogue = () =>
    h.overlay.querySelector(".dialogue > .text")?.textContent ?? "";
  return { h, dialogue };
}

/** A beat that writes `target`, replacing what it shows. */
const write = (
  target: string,
  instructions: unknown[],
  opts: { instant?: boolean; time?: number } = {},
) => ({
  target,
  replace: true,
  writes: [
    {
      target,
      instructions,
      instant: opts.instant ?? true,
      ...(opts.time != null ? { time: opts.time } : {}),
    },
  ],
});

const beat = (params: Record<string, unknown>) =>
  BeatMessage.type.notification({
    messages: [],
    text: [],
    image: [],
    after: [],
    ...params,
  } as any);

/** Drive the page's timeline and timers by hand, and record the reveal
 *  animations the page starts. It sees when the DOM changes and when each
 *  reveal is set to begin, on the page's own clock; composited pixels are the
 *  live measurement's. */
function controlTime(h: { overlay: HTMLElement }) {
  const g = globalThis as any;
  const played: { startTime: number | null; effect: any }[] = [];
  const saved = { Animation: g.Animation, KeyframeEffect: g.KeyframeEffect };
  g.KeyframeEffect = class {
    constructor(
      public target: HTMLElement,
      public keyframes: unknown,
      public timing: { delay?: number } = {},
    ) {}
    getComputedTiming() {
      return { endTime: this.timing.delay ?? 0 };
    }
  };
  g.Animation = class {
    startTime: number | null = null;
    finished = Promise.resolve();
    constructor(public effect: any) {
      played.push(this);
    }
    play() {}
    cancel() {}
    finish() {}
  };
  const timeline = h.overlay.ownerDocument.timeline as unknown as {
    currentTime: number;
  };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  timeline.currentTime = 1_000;
  const win = h.overlay.ownerDocument.defaultView as any;
  let changedAt: number | undefined;
  const observer = new win.MutationObserver(() => {
    changedAt ??= timeline.currentTime;
  });
  observer.observe(h.overlay, { subtree: true, childList: true, characterData: true });
  return {
    played,
    changedAt: () => changedAt,
    async at(time: number) {
      const step = time - timeline.currentTime;
      timeline.currentTime = time;
      vi.advanceTimersByTime(step);
      await flushMicrotasks(10);
    },
    /** The first instant a letter of the page's reveals is set to show. */
    firstReveal() {
      const letters = played.filter((a) =>
        a.effect?.target?.classList?.contains("text_letter"),
      );
      return Math.min(
        ...letters.map((a) => (a.startTime ?? NaN) + (a.effect.timing?.delay ?? 0)),
      );
    },
    restore() {
      observer.disconnect();
      g.Animation = saved.Animation;
      g.KeyframeEffect = saved.KeyframeEffect;
      timeline.currentTime = 0;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a composed beat on the page (#1820)", () => {
  test("a played beat commits at the instant its text starts revealing, the old beat whole until then", async () => {
    // Round 6, class 2.
    const { h, dialogue } = await showing();
    const time = controlTime(h);
    try {
      // Stamped to start at 1100; its first letter waits 100 ms.
      h.ui.onReceiveNotification(
        beat({
          text: [
            write(
              "dialogue",
              [
                { text: "D", after: 0.1 },
                { text: "o", after: 0.2 },
              ],
              { instant: false, time: 1_100 },
            ),
          ],
          time: 1_100,
        }),
      );
      await time.at(1_199);
      expect(dialogue()).toBe("Do you understand?");
      expect(time.changedAt()).toBeUndefined();

      await time.at(1_200);
      expect(dialogue()).toBe("Do");
      expect(time.firstReveal()).toBe(1_200);
      expect(time.changedAt()).toBe(1_200);
    } finally {
      time.restore();
    }
  });

  test("an unchanged name does not move the commit ahead of the new dialogue's first letter", async () => {
    // Round 7, class 3: the name the page already shows reveals nothing, so
    // only the dialogue's first letter counts.
    const { h, dialogue } = await showing();
    const name = h.overlay.querySelector(".character_name") as any;
    const shownName = JSON.parse(name.__sdTxt);
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [
            write("character_name", shownName, { instant: false, time: 1_100 }),
            write("dialogue", [{ text: "S", after: 0.1 }], { instant: false, time: 1_100 }),
          ],
          time: 1_100,
        }),
      );
      await time.at(1_150);
      expect(dialogue()).toBe("Do you understand?");

      await time.at(1_200);
      expect(dialogue()).toBe("S");
    } finally {
      time.restore();
    }
  });

  test("a beat that arrives while one waits for its commit puts the waiting one up first, and later beats still go up", async () => {
    // Round 7, class 1: impossible by construction. One beat waits at a
    // time, and anything after it puts it up first; there is no held state a
    // stale timer could leave behind.
    const { h, dialogue } = await showing();
    const time = controlTime(h);
    try {
      h.ui.onReceiveNotification(
        beat({
          text: [write("dialogue", [{ text: "Waiting" }], { instant: false, time: 1_100 })],
          time: 1_100,
        }),
      );
      await time.at(1_010);
      expect(dialogue()).toBe("Do you understand?");

      h.ui.onReceiveNotification(beat({ text: [write("dialogue", [{ text: "Next" }])] }));
      expect(dialogue()).toBe("Next");
      // The waiting beat's timer finds nothing left to do.
      await time.at(1_300);
      h.ui.onReceiveNotification(beat({ text: [write("dialogue", [{ text: "Later" }])] }));
      expect(dialogue()).toBe("Later");
    } finally {
      time.restore();
    }
  });

  test("a beat's failure once applied is reported", async () => {
    // Round 6, class 5: impossible by construction that a failure hides
    // behind an early answer (the engine answers a composed op itself), and
    // a failure the page meets applying a beat is reported.
    const { h } = await showing();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const apply = h.ui.onReceiveRequest.bind(h.ui);
    (h.ui as any).onReceiveRequest = (msg: any) =>
      msg.method === "ui/write-text"
        ? Promise.reject(new Error("failed to apply"))
        : apply(msg);

    h.ui.onReceiveNotification(beat({ text: [write("dialogue", [{ text: "X" }])] }));
    await flushMicrotasks(10);

    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("ui/write-text failed in a beat"),
      expect.objectContaining({ message: "failed to apply" }),
    );
  });

  test("the pictures a beat waiting for its commit will paint stay resident", async () => {
    // Round 6, class 6.
    const { h } = await showing();
    const assets = new AssetManager(createStubApp(h.overlay, () => {}));
    const src = "https://example.com/waiting.png";
    const time = controlTime(h);
    try {
      expect(assets.derivedPins().has(src)).toBe(false);
      h.ui.onReceiveNotification(
        beat({
          image: [
            {
              target: "portrait",
              replace: false,
              writes: [
                {
                  target: "portrait",
                  instructions: [{ control: "show", content: { srcs: [src] } }],
                  instant: false,
                  time: 1_100,
                },
              ],
            },
          ],
          time: 1_100,
        }),
      );
      expect(assets.derivedPins().has(src)).toBe(true);
    } finally {
      time.restore();
    }
  });

  test("a display still waiting has no time limit: the page shows the old screen whole", async () => {
    // Round 6, class 4: impossible by construction. Nothing of a display
    // reaches the page before its beat, and the page keeps no timer for it.
    const { h, dialogue } = await showing();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await h.rerender(SOURCE, LINE, { connectOnly: true });
    vi.advanceTimersByTime(60_000);
    await flushMicrotasks(10);

    expect(dialogue()).toBe("Do you understand?");
  });
});

const LAYOUT = (dialogue: string, leaf: string) => `layout main with
  textbox {
    ${dialogue} {
      ${leaf}
      stroke
    }
  }
end

${SOURCE}`;

const LAYOUT_LINE = LINE + 9;

describe("a composed beat's dedupe against the live DOM (#1820)", () => {
  test("a target whose leaf the display changes is rewritten, not left as it was", async () => {
    // Round 6, class 1: the layout's text leaf gains content while the same
    // line is previewed. The beat's create puts it in the reused leaf; the
    // dialogue then holds only its line.
    const { h } = await showing(LAYOUT("dialogue", "text"), LAYOUT_LINE);
    const text = () => h.overlay.querySelector(".dialogue > .text")?.textContent;
    expect(text()).toBe("Do you understand?");

    await h.rerender(LAYOUT("dialogue", 'text "placeholder"'), LAYOUT_LINE);

    expect(text()).toBe("Do you understand?");
  });

  test("a style-only change of a reused target leaves its identical text as it is", async () => {
    // Round 7, class 6: a create that restyles the target changes nothing it
    // holds, so its identical text is not rebuilt.
    const { h } = await showing(LAYOUT("dialogue", "text"), LAYOUT_LINE);
    const leaf = h.overlay.querySelector(".dialogue > .text")!;
    expect(leaf.textContent).toBe("Do you understand?");
    const win = h.overlay.ownerDocument.defaultView as any;
    const rebuilt: MutationRecord[] = [];
    const observer = new win.MutationObserver((records: MutationRecord[]) =>
      rebuilt.push(...records),
    );
    observer.observe(leaf, { childList: true, subtree: true, characterData: true });

    await h.rerender(LAYOUT("dialogue #background-color=red", "text"), LAYOUT_LINE);
    rebuilt.push(...observer.takeRecords());
    observer.disconnect();

    expect(h.overlay.querySelector(".dialogue > .text")).toBe(leaf);
    expect(leaf.textContent).toBe("Do you understand?");
    expect(rebuilt).toEqual([]);
  });
});
