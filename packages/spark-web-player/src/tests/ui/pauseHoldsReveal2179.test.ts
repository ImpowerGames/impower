import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BeatMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { WriteImageMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { WriteTextMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
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
  finished!: Promise<TimedAnimation>;
  protected _start: number | null = null;
  protected _hold: number | null = null;
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
    this.update();
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
    if (this._start != null && this._hold == null) {
      this._start = timeline.currentTime - value / this.playbackRate;
    } else {
      this._hold = value;
    }
    this.update();
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
    this.update();
  }
  pause() {
    const time = this.currentTime ?? 0;
    this._start = null;
    this._hold = time;
  }
  finish() {
    this._start = timeline.currentTime - this.end / this.playbackRate;
    this._hold = null;
    this.update();
  }
  cancel() {
    this._start = null;
    this._hold = null;
    this._fail(new Error("cancelled"));
    this.renew();
  }
  update() {
    if (this.playState === "finished") {
      this._settle();
    }
  }
}

const LETTER_STEP = 0.1;
const TEXT = "abcdefghij";

const line = (instant = false, time = 0) =>
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [...TEXT].map((text, i) => ({
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

  test("stepping the clock while paused moves the reveal by the step alone", async () => {
    const page = makePage();
    await page.write();
    page.frame(250);
    page.pause();
    page.ui.onSkip(0.3);
    expect(page.revealed()).toBe(6);
    page.frame(2_000);
    expect(page.revealed()).toBe(6);
    page.unpause();
    page.frame(100);
    expect(page.revealed()).toBe(7);
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
    expect(animations).toHaveLength(1);
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

  test("a line still waiting to go up when the game pauses keeps the rest of its wait for after the pause", async () => {
    const page = makePage();
    page.frame(1_000);
    page.ui.onReceiveNotification(
      BeatMessage.type.notification({ messages: [line(false, 1_100)], time: 1_100 } as any),
    );
    page.frame(50);
    page.pause();
    page.frame(1_000);
    await new Promise((resolve) => setTimeout(resolve, 150));
    page.frame(0);
    await flushMicrotasks(10);
    expect(page.letters()).toHaveLength(TEXT.length);
    expect(page.revealed()).toBe(0);
    page.unpause();
    page.frame(40);
    expect(page.revealed()).toBe(0);
    page.frame(20);
    expect(page.revealed()).toBe(1);
    page.frame(100);
    expect(page.revealed()).toBe(2);
  });
});
