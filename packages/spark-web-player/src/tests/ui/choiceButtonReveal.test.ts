// A choice under a caption waits for the caption to type out: the interpreter
// delays its label's letters until then. The button waits with its label. The
// page keeps a played text target with nothing on it hidden until its first
// letter's reveal begins, so no empty button shows while the caption types, or
// before the beat starts (#827). The preview, a save the page loads and
// displays, and an instant write repeating a played one show the buttons with
// their labels at once, and the box of a lone `>` break, with no letter to
// wait for, shows as its beat is written.
//
// Beats play through the engine's own Coordinator into the page's own
// UIManager. jsdom has no Web Animations, so the animations the page starts
// are recorded here, and what an element shows at a moment is read from them
// the way a browser composites them.

import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { TextInstruction } from "@impower/spark-engine/src/game/core/types/Instruction";
import type { Instructions } from "@impower/spark-engine/src/game/core/types/Instructions";
import { BEAT_LEAD_MS } from "@impower/spark-engine/src/game/core/utils/sharedClock";
import { describe, expect, test } from "vitest";
import {
  compile,
  createDOMHarness,
  flushMicrotasks,
  type DOMHarness,
} from "./domTestHarness";

const MAIN_URI = "inmemory:///main.sd";

const SOURCE = `-> caption

scene caption
  choose
    BOB: And now, up or down?
    * Up
      You went up.
    * Down
      You went down.
  end
end

scene alone
  choose
    * Left
      Left it is.
    * Right
      Right it is.
  end
end

scene pause
  Hi.
  >
  Bye.
end
`;

const CAPTION_LINE = SOURCE.split("\n").findIndex((l) =>
  l.includes("And now, up or down?"),
);

interface Played {
  effect: {
    target: HTMLElement;
    keyframes: Record<string, unknown>[];
    timing: { delay?: number; duration?: number; fill?: string };
  };
  startTime: number | null;
  cancelled: boolean;
  /** Finished early, so it reads as it does at its end. */
  done: boolean;
}

let played: Played[] = [];

/** Record every Web Animation the page makes from here on. */
const recordAnimations = () => {
  played = [];
  const g = globalThis as any;
  g.KeyframeEffect = class {
    constructor(
      public target: HTMLElement,
      public keyframes: Record<string, unknown>[],
      public timing: { delay?: number; duration?: number; fill?: string },
    ) {}
    getComputedTiming() {
      return {
        endTime: (this.timing.delay ?? 0) + (this.timing.duration ?? 0),
      };
    }
  };
  g.Animation = class {
    startTime: number | null = null;
    cancelled = false;
    done = false;
    finished = Promise.resolve();
    constructor(public effect: Played["effect"]) {
      played.push(this);
    }
    play() {
      this.startTime ??= Number(document.timeline.currentTime);
    }
    cancel() {
      this.cancelled = true;
    }
    finish() {
      this.done = true;
    }
  };
};

/** What `property` reads on `el` at document time `t`: its inline value,
 *  under each running animation that sets it, in the order the page made
 *  them. A lone keyframe is the end of its animation, which starts from the
 *  value underneath. */
const styleAt = (el: HTMLElement, property: string, t: number): string => {
  let value = el.style.getPropertyValue(property);
  for (const animation of played) {
    const { target, keyframes, timing } = animation.effect;
    if (target !== el || animation.cancelled || animation.startTime == null) {
      continue;
    }
    const frames = keyframes.filter((k) => k[property] != null);
    if (frames.length === 0) {
      continue;
    }
    const from = frames.length > 1 ? String(frames[0]![property]) : value;
    const to = String(frames.at(-1)![property]);
    const delay = timing.delay ?? 0;
    const duration = timing.duration ?? 0;
    const fill = timing.fill ?? "auto";
    const local = animation.done ? Infinity : t - animation.startTime;
    if (local < delay) {
      if (fill === "backwards" || fill === "both") {
        value = from;
      }
    } else if (local < delay + duration) {
      const progress = (local - delay) / duration;
      if (property === "opacity") {
        const start = Number(from || 1);
        value = String(start + (Number(to) - start) * progress);
      } else {
        value = progress < 0.5 ? from : to;
      }
    } else if (fill === "forwards" || fill === "both") {
      value = to;
    }
  }
  return value;
};

/** Whether `el` is on screen at `t`, as far as its own style says. */
const shownAt = (el: HTMLElement, t: number) =>
  styleAt(el, "display", t) !== "none" &&
  styleAt(el, "visibility", t) !== "hidden" &&
  Number(styleAt(el, "opacity", t) || 1) > 0;

/** The letters of `el`'s label that can be seen at `t`. */
const labelAt = (el: HTMLElement, t: number) =>
  Array.from(el.querySelectorAll<HTMLElement>(".text_letter"))
    .filter((letter) => Number(styleAt(letter, "opacity", t)) > 0)
    .map((letter) => letter.textContent)
    .join("");

const choiceButton = (h: DOMHarness, index: number) => {
  const button = Array.from(
    h.overlay.querySelectorAll<HTMLElement>(".choice"),
  ).find((el) => el.classList.contains(String(index)));
  expect(button).toBeTruthy();
  return button!;
};

/** Milliseconds from the beat's start until `target`'s first letter. */
const firstLetterDelay = (beat: Instructions, target: string) =>
  Math.min(...beat.text![target]!.map((e) => (e.after ?? 0) * 1000));

/** Play a beat as PLAY does: through the Coordinator, which stamps it with
 *  the time it starts. A beat with sound (a typed line's typewriter) starts
 *  on the first tick after its sound has loaded. */
const play = async (h: DOMHarness, beat: Instructions) => {
  (h.game.context.system as any).previewing = undefined;
  const coordinator = new Coordinator(h.game, beat);
  const started = () => (coordinator as any)._startedExecution === true;
  for (let tick = 0; tick < 20 && !started(); tick += 1) {
    await flushMicrotasks(20);
    coordinator.onUpdate({ deltaMS: 0 } as any);
  }
  expect(started()).toBe(true);
  await flushMicrotasks(20);
};

/** When the played beat starts on the document timeline: the start time the
 *  page gave its letters' reveals. */
const beatStart = () => {
  const starts = new Set(
    played
      .filter((a) => a.effect.target.classList.contains("text_letter"))
      .map((a) => a.startTime),
  );
  expect(starts.size).toBe(1);
  return [...starts][0]!;
};

describe("a choice button", () => {
  test("under a caption stays off screen until its label starts to appear", async () => {
    const h = createDOMHarness(SOURCE);
    recordAnimations();
    await h.ready;
    h.jumpTo("caption");
    const beat = h.nextBeat()!;
    expect(beat.choices).toEqual(["choice 0", "choice 1"]);
    const labelDelay = firstLetterDelay(beat, "choice 0");
    expect(labelDelay).toBeGreaterThan(0);
    expect(firstLetterDelay(beat, "choice 1")).toBe(labelDelay);

    await play(h, beat);

    const start = beatStart();
    for (const [index, label] of [
      [0, "Up"],
      [1, "Down"],
    ] as const) {
      const button = choiceButton(h, index);
      // While the caption types.
      expect(shownAt(button, start + labelDelay / 2)).toBe(false);
      expect(shownAt(button, start)).toBe(false);
      expect(shownAt(button, start - 1)).toBe(false);
      expect(shownAt(button, start + labelDelay - 1)).toBe(false);
      expect(labelAt(button, start + labelDelay - 1)).toBe("");
      // As the label starts to appear.
      expect(shownAt(button, start + labelDelay + 1)).toBe(true);
      expect(labelAt(button, start + labelDelay + 1)).not.toBe("");
      expect(shownAt(button, start + 10_000)).toBe(true);
      expect(labelAt(button, start + 10_000)).toBe(label);
    }
  });

  test("in a beat of choices alone shows with its label as the beat starts", async () => {
    const h = createDOMHarness(SOURCE);
    recordAnimations();
    await h.ready;
    h.jumpTo("alone");
    const beat = h.nextBeat()!;
    expect(beat.choices).toEqual(["choice 0", "choice 1"]);
    expect(firstLetterDelay(beat, "choice 0")).toBe(0);

    await play(h, beat);

    const start = beatStart();
    for (const [index, label] of [
      [0, "Left"],
      [1, "Right"],
    ] as const) {
      const button = choiceButton(h, index);
      expect(shownAt(button, start - 1)).toBe(false);
      expect(shownAt(button, start)).toBe(true);
      expect(labelAt(button, start + 1)).not.toBe("");
      expect(labelAt(button, start + 10_000)).toBe(label);
    }
  });

  test("shows with its label at once in the preview", async () => {
    const h = createDOMHarness(SOURCE, CAPTION_LINE);
    recordAnimations();
    await h.ready;
    await h.preview(CAPTION_LINE);
    await flushMicrotasks(20);

    const now = Number(document.timeline.currentTime);
    expect(shownAt(choiceButton(h, 0), now)).toBe(true);
    expect(labelAt(choiceButton(h, 0), now)).toBe("Up");
    expect(shownAt(choiceButton(h, 1), now)).toBe(true);
    expect(labelAt(choiceButton(h, 1), now)).toBe("Down");
  });

  test("shows with its label at once from a save the page loads and displays", async () => {
    // A save taken at the caption, as the worker's route game takes it.
    const route = new Game({
      program: compile(SOURCE) as any,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...args: any[]) => {
        fn(...args);
        return 0;
      }) as any,
    } as any);
    route.setStartFrom({ file: MAIN_URI, line: CAPTION_LINE });
    route.simulate();
    expect(route.simulation).toBe("success");

    const h = createDOMHarness(SOURCE, CAPTION_LINE, {
      loadCheckpoint: route.save() as string,
    });
    recordAnimations();
    await h.ready;
    await h.preview(CAPTION_LINE);
    await flushMicrotasks(20);

    const now = Number(document.timeline.currentTime);
    expect(shownAt(choiceButton(h, 0), now)).toBe(true);
    expect(labelAt(choiceButton(h, 0), now)).toBe("Up");
    expect(shownAt(choiceButton(h, 1), now)).toBe(true);
    expect(labelAt(choiceButton(h, 1), now)).toBe("Down");
  });
});

describe("an instant write", () => {
  test("repeating a played write shows the target with its text at once", async () => {
    // Nothing clears the target between the two writes, as for a target with
    // text of its own, which the game does not clear between beats.
    const h = createDOMHarness(SOURCE);
    recordAnimations();
    await h.ready;
    const text = h.game.module.ui.text;
    const label: TextInstruction[] = [
      { control: "show", text: "U", after: 0.5 },
      { control: "show", text: "p", after: 0.55 },
    ];
    await text.write("choice 0", label, false, BEAT_LEAD_MS);
    await flushMicrotasks(20);
    const button = choiceButton(h, 0);
    const now = Number(document.timeline.currentTime);
    expect(shownAt(button, now)).toBe(false);

    await text.write("choice 0", label, true);
    await flushMicrotasks(20);

    expect(shownAt(button, now)).toBe(true);
    expect(labelAt(button, now)).toBe("Up");
  });
});

describe("the empty box of a lone `>` break", () => {
  test("shows as the beat is written, with no letter to wait for", async () => {
    const h = createDOMHarness(SOURCE);
    recordAnimations();
    await h.ready;
    h.jumpTo("pause");
    h.nextBeat();
    const pause = h.nextBeat()!;
    const targets = Object.keys(pause.text ?? {});
    expect(targets.length).toBeGreaterThan(0);
    expect(Object.values(pause.text!).flat()).toEqual([]);

    await play(h, pause);

    const now = Number(document.timeline.currentTime);
    for (const target of targets) {
      const box = h.overlay.querySelector<HTMLElement>(`.${target}`);
      expect(box).toBeTruthy();
      expect(shownAt(box!, now)).toBe(true);
    }
  });
});
