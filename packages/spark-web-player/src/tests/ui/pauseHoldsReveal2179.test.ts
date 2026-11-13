import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BeatMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { WriteImageMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { WriteTextMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { AnimateElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { AudioClock } from "../../app/AudioClock";
import UIManager from "../../app/managers/UIManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { flushMicrotasks } from "./domTestHarness";

const timeline = { currentTime: 0 };

class TimedEffect {
  constructor(
    public target: Element,
    public keyframes: unknown,
    public timing: EffectTiming = {},
  ) {}
  getTiming() {
    return this.timing;
  }
  getComputedTiming() {
    const { delay = 0, duration = 0, endDelay = 0 } = this.timing;
    return { endTime: delay + Number(duration) + endDelay };
  }
}

const animations: TimedAnimation[] = [];

class TimedAnimation {
  timeline = timeline;
  playbackRate = 1;
  replaceState = "active";
  finished!: Promise<TimedAnimation>;
  protected _start: number | null = null;
  protected _hold: number | null = null;
  protected _isFinished = false;
  protected _settle!: () => void;
  protected _fail!: (reason: unknown) => void;
  constructor(public effect: TimedEffect) {
    this.renew();
    animations.push(this);
  }
  protected renew() {
    this.finished = new Promise((resolve, reject) => {
      this._settle = () => resolve(this);
      this._fail = reject;
    });
    this.finished.catch(() => {});
  }
  get end() {
    return this.effect.getComputedTiming().endTime;
  }
  get startTime() {
    return this._start;
  }
  set startTime(value: number | null) {
    this._start = value;
    if (value != null) {
      this._hold = null;
    }
    this.update(true);
  }
  get currentTime(): number | null {
    if (this._hold != null) {
      return this._hold;
    }
    if (this._start == null) {
      return null;
    }
    return (timeline.currentTime - this._start) * this.playbackRate;
  }
  set currentTime(value: number) {
    if (this._hold != null || this._start == null) {
      this._hold = value;
    } else {
      this._start = timeline.currentTime - value / this.playbackRate;
    }
    this.update(true);
  }
  get playState() {
    const time = this.currentTime;
    if (time == null) {
      return "idle";
    }
    if (this._start == null) {
      return "paused";
    }
    return time >= this.end ? "finished" : "running";
  }
  play() {
    const time = this.currentTime;
    const seek = time == null || time < 0 || time >= this.end ? 0 : time;
    this._start = timeline.currentTime - seek / this.playbackRate;
    this._hold = null;
    this.update(true);
  }
  pause() {
    const time = this.currentTime ?? 0;
    this._start = null;
    this._hold = time;
    this.update();
  }
  finish() {
    this._start = timeline.currentTime - this.end / this.playbackRate;
    this._hold = null;
    this.update(true);
  }
  cancel() {
    this._start = null;
    this._hold = null;
    this._isFinished = false;
    this._fail(new Error("cancelled"));
    this.renew();
  }
  update(didSeek = false) {
    if (this._start != null) {
      const unconstrained = didSeek
        ? this.currentTime!
        : (timeline.currentTime - this._start) * this.playbackRate;
      if (unconstrained >= this.end) {
        this._hold = didSeek ? unconstrained : this.end;
      } else {
        if (didSeek && this._hold != null) {
          this._start = timeline.currentTime - this._hold / this.playbackRate;
        }
        this._hold = null;
      }
    }
    const finished = this.playState === "finished";
    if (finished && !this._isFinished) {
      this._settle();
    } else if (!finished && this._isFinished) {
      this.renew();
    }
    this._isFinished = finished;
  }
}

const LETTER_STEP = 0.1;
const TEXT = "abcdefghij";

const line = (instant = false, time = 0, text = TEXT) =>
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [...text].map((text, i) => ({
      text,
      after: i * LETTER_STEP,
      over: 0,
    })) as any,
    instant,
    time,
  });

const makePage = () => {
  timeline.currentTime = 0;
  const overlay = document.createElement("div");
  overlay.innerHTML = `<div class="dialogue"><div class="text"></div></div><div class="portrait"><div class="image"></div></div>`;
  document.body.appendChild(overlay);
  const app: any = {
    overlay,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  const ui = new UIManager(app);
  const morphs = MorphPlayback.for(overlay);
  morphs.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  ui.onUpdate({ elapsedTime: 0 } as any);
  let paused = false;
  let elapsed = 0;
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
  const frame = (ms: number) => {
    timeline.currentTime += ms;
    for (const cb of frames.splice(0)) {
      cb(timeline.currentTime);
    }
    if (!paused) {
      elapsed += ms / 1000;
    }
    ui.onUpdate({ elapsedTime: elapsed } as any);
    for (const animation of animations) {
      animation.update();
    }
  };
  const letters = () =>
    Array.from(overlay.querySelectorAll(".dialogue .text .text_letter"));
  const revealed = () =>
    letters().filter((letter) => {
      const reveal = (letter as any).__sdReveal as TimedAnimation | undefined;
      const time = reveal?.currentTime;
      return time != null && time >= Number(reveal!.effect.timing.delay ?? 0);
    }).length;
  return {
    overlay,
    ui,
    morphs,
    letters,
    revealed,
    frame,
    pause() {
      paused = true;
      ui.onPause();
    },
    unpause() {
      paused = false;
      ui.onUnpause();
    },
    async write(instant = false) {
      void ui.onReceiveRequest(line(instant));
      await flushMicrotasks(10);
    },
  };
};

let previous: { Animation: unknown; KeyframeEffect: unknown; timeline: unknown };

beforeEach(() => {
  const g = globalThis as any;
  previous = {
    Animation: g.Animation,
    KeyframeEffect: g.KeyframeEffect,
    timeline: (document as any).timeline,
  };
  animations.length = 0;
  g.Animation = TimedAnimation;
  g.KeyframeEffect = TimedEffect;
  Object.defineProperty(document, "timeline", {
    configurable: true,
    value: timeline,
  });
  g.CSS ??= {};
  g.CSS.escape ??= (value: string) => value;
});

afterEach(() => {
  const g = globalThis as any;
  g.Animation = previous.Animation;
  g.KeyframeEffect = previous.KeyframeEffect;
  Object.defineProperty(document, "timeline", {
    configurable: true,
    value: previous.timeline,
  });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("pausing PLAY holds the typewriter (#2179)", () => {
  test("no letter appears while paused, and resuming continues from the letter it stopped at", async () => {
    const page = makePage();
    await page.write();
    expect(page.letters()).toHaveLength(TEXT.length);
    page.frame(250);
    expect(page.revealed()).toBe(3);
    page.pause();
    page.frame(3_000);
    expect(page.revealed()).toBe(3);
    page.unpause();
    page.frame(0);
    expect(page.revealed()).toBe(3);
    page.frame(100);
    expect(page.revealed()).toBe(4);
    page.frame(550);
    expect(page.revealed()).toBe(TEXT.length);
  });

  test("a pause held through the end of the reveal keeps the whole line and replays none of it", async () => {
    const page = makePage();
    await page.write();
    page.frame(950);
    expect(page.revealed()).toBe(TEXT.length);
    page.pause();
    page.frame(2_000);
    expect(page.revealed()).toBe(TEXT.length);
    page.unpause();
    for (let i = 0; i < 10; i += 1) {
      page.frame(50);
      expect(page.revealed()).toBe(TEXT.length);
    }
  });

  test("the whole line shown while paused stays shown after resuming", async () => {
    const page = makePage();
    await page.write();
    page.frame(250);
    page.pause();
    await page.write(true);
    expect(page.revealed()).toBe(TEXT.length);
    page.frame(1_000);
    page.unpause();
    page.frame(50);
    expect(page.revealed()).toBe(TEXT.length);
  });

  test("after a pause and resume in the middle of a line, the speaking mouth and the letters are at the same moment of it", async () => {
    const page = makePage();
    page.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "morph/speech",
      params: { character: "mia", spans: [[0, 1]], time: 0 },
    } as any);
    await page.write();
    const speech = () => (page.morphs as any).speech.spans[0][0] as number;
    const mouthAt = () => ((page.morphs as any).time - speech()) * 1000;
    const lettersAt = () =>
      Number(((page.letters().at(-1) as any).__sdReveal as TimedAnimation).currentTime);
    page.frame(250);
    expect(mouthAt()).toBeCloseTo(lettersAt(), 6);
    page.pause();
    page.frame(2_000);
    page.unpause();
    page.frame(200);
    expect(lettersAt()).toBeCloseTo(450, 6);
    expect(mouthAt()).toBeCloseTo(lettersAt(), 6);
    expect(page.revealed()).toBe(5);
  });

  test("an image's fade that follows its wrapper's transition starts after a pause in that transition by the pause's length", async () => {
    const page = makePage();
    const fade = (duration: number) => ({
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      timing: { duration },
    });
    void page.ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "portrait",
        instructions: [
          {
            control: "show",
            targetAnimations: [fade(0.2) as any],
            content: {
              background: 'url("a.png")',
              imageNames: "a",
              src: "a.png",
              srcs: ["a.png"],
              enterAnimation: fade(0.1) as any,
            },
          },
        ],
        instant: false,
        time: 0,
      }),
    );
    await flushMicrotasks(10);
    expect(animations).toHaveLength(2);
    page.frame(100);
    page.pause();
    page.frame(1_000);
    page.unpause();
    page.frame(150);
    await flushMicrotasks(20);
    expect(animations).toHaveLength(2);
    expect(animations[1]!.startTime).toBeCloseTo(1_200, 6);
  });

  test("a held fade-out does not freeze the outgoing portrait's morphs before it starts", async () => {
    const page = makePage();
    const freeze = vi.spyOn(page.morphs, "freezeWithin");
    const outgoing = page.overlay.querySelector(".portrait .image") as HTMLElement;
    const exit = new TimedAnimation(new TimedEffect(outgoing, [], { delay: 500, duration: 100 }));
    exit.startTime = 0;
    (page.ui as any)._hold.add(exit);
    (page.ui as any).freezeWhenExitStarts(outgoing, [exit]);
    page.frame(200);
    page.pause();
    page.frame(1_000);
    expect(freeze).not.toHaveBeenCalled();
    page.unpause();
    page.frame(200);
    expect(freeze).not.toHaveBeenCalled();
    page.frame(150);
    expect(freeze).toHaveBeenCalledWith(outgoing);
  });

  const fade = (duration: number) => ({
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
    timing: { duration },
  });

  const portrait = (wrapper: number[], enter: number) =>
    WriteImageMessage.type.request({
      target: "portrait",
      instructions: [
        {
          control: "show",
          targetAnimations: wrapper.map((d) => fade(d) as any),
          content: {
            background: 'url("a.png")',
            imageNames: "a",
            src: "a.png",
            srcs: ["a.png"],
            enterAnimation: fade(enter) as any,
          },
        },
      ],
      instant: false,
      time: 0,
    });

  test("a fade that follows wrapper effects of different lengths starts when the longest one actually ends after a pause", async () => {
    const page = makePage();
    void page.ui.onReceiveRequest(portrait([0.1, 0.5], 0.1));
    await flushMicrotasks(10);
    expect(animations).toHaveLength(3);
    page.frame(180);
    page.pause();
    page.frame(300);
    page.unpause();
    for (let i = 0; i < 7; i += 1) {
      page.frame(50);
      await flushMicrotasks(20);
    }
    expect(animations).toHaveLength(3);
    expect(animations[2]!.startTime).toBeCloseTo(800, 6);
  });

  test("letting go of a paused page lets its animations finish rather than leaving them held", async () => {
    const page = makePage();
    const el = page.overlay.querySelector(".portrait") as HTMLElement;
    (el as any).__sdId = "portrait-el";
    (page.ui as any)._elements.set("portrait-el", el);
    void page.ui.onReceiveRequest(
      AnimateElementsMessage.type.request({
        effects: [{ element: "portrait-el", animations: [fade(1) as any] }],
      }),
    );
    await flushMicrotasks(10);
    expect(animations).toHaveLength(1);
    page.frame(300);
    page.pause();
    expect(animations[0]!.playState).toBe("paused");
    page.ui.onDispose();
    expect(animations[0]!.playState).toBe("running");
    page.frame(800);
    expect(animations[0]!.playState).toBe("finished");
  });

  test("a line written whole while paused goes up and answers without waiting for resume", async () => {
    const page = makePage();
    page.pause();
    let answered = false;
    void page.ui.onReceiveRequest(line(true)).then(() => {
      answered = true;
    });
    await flushMicrotasks(20);
    expect(page.revealed()).toBe(TEXT.length);
    expect(answered).toBe(true);
  });

  const NEXT = "klmnopqrst";
  const dialogue = (page: ReturnType<typeof makePage>) =>
    page.overlay.querySelector(".dialogue .text")?.textContent ?? "";
  const beat = (time: number) =>
    BeatMessage.type.notification({
      messages: [
        WriteTextMessage.type.request({ target: "dialogue", instructions: [], instant: true }),
        line(false, time, NEXT),
      ],
      time,
    } as any);
  const realWait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  test("a line still waiting to go up when the game pauses leaves the paused frame alone and keeps the rest of its wait", async () => {
    const page = makePage();
    await page.write(true);
    page.frame(1_000);
    page.ui.onReceiveNotification(beat(1_100));
    page.frame(50);
    page.pause();
    page.frame(1_000);
    await realWait(150);
    page.frame(0);
    await flushMicrotasks(10);
    expect(dialogue(page)).toBe(TEXT);
    page.unpause();
    await realWait(80);
    page.frame(40);
    await flushMicrotasks(10);
    expect(dialogue(page)).toBe(TEXT);
    page.frame(20);
    await flushMicrotasks(10);
    expect(dialogue(page)).toBe(NEXT);
    expect(page.revealed()).toBe(1);
    page.frame(100);
    expect(page.revealed()).toBe(2);
  });

  test("a line that arrives after the game paused keeps its whole wait on the story's clock", async () => {
    const page = makePage();
    await page.write(true);
    page.frame(1_000);
    page.pause();
    page.frame(50);
    page.ui.onReceiveNotification(beat(1_100));
    page.frame(2_000);
    await realWait(150);
    page.frame(0);
    await flushMicrotasks(10);
    expect(dialogue(page)).toBe(TEXT);
    page.unpause();
    await realWait(130);
    page.frame(90);
    await flushMicrotasks(10);
    expect(dialogue(page)).toBe(TEXT);
    page.frame(20);
    await flushMicrotasks(10);
    expect(dialogue(page)).toBe(NEXT);
    expect(page.revealed()).toBe(1);
  });
});

describe("a finished animation (#2198)", () => {
  test("the hold lets go of a reveal once it has finished, and a pause leaves it finished", async () => {
    const page = makePage();
    await page.write();
    page.frame(2_000);
    expect(page.revealed()).toBe(TEXT.length);
    const reveals = page
      .letters()
      .map((letter) => (letter as any).__sdReveal as TimedAnimation);
    expect(reveals.map((reveal) => reveal.playState)).toEqual(
      reveals.map(() => "finished"),
    );
    page.pause();
    expect(reveals.map((reveal) => reveal.playState)).toEqual(
      reveals.map(() => "finished"),
    );
    const tracked = Array.from((page.ui as any)._hold._animations.keys());
    expect(tracked.filter((animation) => reveals.includes(animation as any))).toEqual([]);
    page.unpause();
    page.frame(50);
    expect(page.revealed()).toBe(TEXT.length);
  });
});

describe("a mid-line image change with a transition (#2184)", () => {
  const AFTER = 1.26;
  const timed = (keyframes: Keyframe[], duration: number) => ({
    keyframes,
    timing: { delay: AFTER, duration, fill: "both" },
  });
  const look = (name: string) => ({
    background: `url("${name}.png")`,
    imageNames: name,
    src: `${name}.png`,
    srcs: [`${name}.png`],
  });
  const changeLook = () =>
    WriteImageMessage.type.request({
      target: "portrait",
      instructions: [
        {
          control: "show",
          targetAnimations: [timed([{}], 0) as any],
          content: {
            ...look("mia@day"),
            enterAnimation: timed([{ opacity: 0 }, { opacity: 1 }], 0.5) as any,
            previousHideAnimation: timed([{ opacity: 1 }, { opacity: 0 }], 0.5) as any,
          },
        },
      ],
      instant: false,
      time: 0,
    });

  const showOldLook = async (page: ReturnType<typeof makePage>) => {
    void page.ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "portrait",
        instructions: [{ control: "show", content: look("mia@night") }],
        instant: true,
        time: 0,
      }),
    );
    await flushMicrotasks(10);
    animations.length = 0;
  };

  const instances = (page: ReturnType<typeof makePage>) =>
    Array.from(page.overlay.querySelectorAll(".portrait .image > *")) as HTMLElement[];
  const on = (el: Element) => animations.filter((a) => a.effect.target === el);
  const fadeStart = (a: TimedAnimation) =>
    Number(a.startTime) + Number(a.effect.timing.delay ?? 0);

  test("both looks get their fade when the change arrives, and the fade starts at the directive's moment", async () => {
    const page = makePage();
    await showOldLook(page);
    const [oldLook] = instances(page);
    void page.ui.onReceiveRequest(changeLook());
    await flushMicrotasks(10);
    const [, newLook] = instances(page);
    expect(instances(page)).toHaveLength(2);
    expect(on(newLook!)).toHaveLength(1);
    expect(on(oldLook!)).toHaveLength(1);
    expect(fadeStart(on(newLook!)[0]!)).toBeCloseTo(AFTER * 1000, 6);
    expect(fadeStart(on(oldLook!)[0]!)).toBeCloseTo(AFTER * 1000, 6);
  });

  test("a later directive's target fade in the same write leaves the earlier change at its own moment", async () => {
    const page = makePage();
    await showOldLook(page);
    const [oldLook] = instances(page);
    const [change] = changeLook().params.instructions;
    void page.ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "portrait",
        instructions: [
          change!,
          {
            control: "hide",
            targetAnimations: [
              {
                keyframes: [{ opacity: 1 }, { opacity: 0 }],
                timing: { delay: 2.5, duration: 0.5, fill: "both" },
              } as any,
            ],
          },
        ],
        instant: false,
        time: 0,
      }),
    );
    await flushMicrotasks(10);
    const [, newLook] = instances(page);
    expect(on(newLook!)).toHaveLength(1);
    expect(on(oldLook!)).toHaveLength(1);
    expect(fadeStart(on(newLook!)[0]!)).toBeCloseTo(AFTER * 1000, 6);
    expect(fadeStart(on(oldLook!)[0]!)).toBeCloseTo(AFTER * 1000, 6);
  });

  test("a pause before the directive's moment moves the fade by the pause's length", async () => {
    const page = makePage();
    await showOldLook(page);
    const [oldLook] = instances(page);
    void page.ui.onReceiveRequest(changeLook());
    await flushMicrotasks(10);
    const [, newLook] = instances(page);
    page.frame(500);
    page.pause();
    page.frame(1_000);
    page.unpause();
    page.frame(0);
    await flushMicrotasks(10);
    expect(on(newLook!)).toHaveLength(1);
    expect(on(oldLook!)).toHaveLength(1);
    expect(fadeStart(on(newLook!)[0]!)).toBeCloseTo(AFTER * 1000 + 1_000, 6);
    expect(fadeStart(on(oldLook!)[0]!)).toBeCloseTo(AFTER * 1000 + 1_000, 6);
    page.frame(700);
    await flushMicrotasks(10);
    expect(oldLook!.isConnected).toBe(true);
  });
});
