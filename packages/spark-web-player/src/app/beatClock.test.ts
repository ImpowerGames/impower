// A beat's sound and reveal are stamped with one start time on the shared
// clock (#681). These tests drive the page's real `AudioManager` and
// `UIManager` with injected clocks, and read where each scheduled its part:
// the audio player's `start` time and offset, and the reveal animation's
// `startTime` on the document timeline.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { UpdateAudioPlayersMessage } from "../../../spark-engine/src/game/modules/audio/classes/messages/UpdateAudioPlayersMessage";
import type { AudioPlayerUpdate } from "../../../spark-engine/src/game/modules/audio/types/AudioPlayerUpdate";
import { WriteImageMessage } from "../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { WriteTextMessage } from "../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { AudioClock, type AudioClockContext } from "./AudioClock";
import AudioManager from "./managers/AudioManager";
import UIManager from "./managers/UIManager";
import { getEventData } from "./utils/getEventData";

/** The page's time origin on the shared clock, in milliseconds. */
const ORIGIN = 1_000_000;

/** A page whose shared clock, audio context and document timeline all
 *  advance only when the test says so. */
const makePage = (outputLatency: number) => {
  let now = ORIGIN + 100;
  const context = {
    state: "running" as AudioContextState,
    currentTime: 2,
    outputLatency,
    // An empty timestamp, as a context reports before it renders: the clock
    // pairs `currentTime` with now instead.
    getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
  };
  const audioClock = new AudioClock(ORIGIN, () => now);
  audioClock.setContext(context);
  const timeline = document.timeline as { currentTime: number };
  timeline.currentTime = now - ORIGIN;
  const advance = (ms: number) => {
    now += ms;
    context.currentTime += ms / 1000;
    timeline.currentTime = now - ORIGIN;
  };

  const overlay = document.createElement("div");
  overlay.innerHTML = `<div class="dialogue"><div class="text"></div></div><div class="portrait"><div class="image"></div></div>`;
  const app: any = {
    overlay,
    audioContext: context,
    audioClock,
    emit: () => {},
  };
  const audio = new AudioManager(app);
  app.audio = audio;
  const ui = new UIManager(app);

  const player = {
    loop: false,
    instances: [],
    start: vi.fn(),
    getNextCueTime: (t: number) => t,
  };
  (audio as any)._audioChannels.set("voice", new Map([["line", player]]));

  return {
    context,
    audioClock,
    audio,
    ui,
    player,
    advance,
    now: () => now,
  };
};

/** A start shaped as the game sends a line's voice: no `now`, so it would
 *  wait for a cue on a player that has one. */
const updateAudio = (
  time: number,
  update: Partial<AudioPlayerUpdate> = {},
) =>
  UpdateAudioPlayersMessage.type.request({
    channel: "voice",
    updates: [{ control: "start", key: "line", ...update }],
    time,
  });

const writeText = (time: number) =>
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [{ text: "Hi", after: 0, over: 0.1 } as any],
    instant: false,
    time,
  });

/** Every animation the reveal made, with the start time it was given. */
let animations: { startTime: number | null }[] = [];

beforeEach(() => {
  animations = [];
  const g = globalThis as any;
  // Follows the Web Animations `play()` auto-rewind: an animation whose
  // start time is still ahead is rewound to start from the beginning when
  // the page is next ready, which leaves its start time unresolved.
  g.Animation = class {
    startTime: number | null = null;
    finished = Promise.resolve();
    constructor(public effect?: unknown) {
      animations.push(this);
    }
    play() {
      const now = document.timeline.currentTime as number;
      if (this.startTime != null && now - this.startTime < 0) {
        this.startTime = null;
      }
    }
  };
  g.KeyframeEffect = class {
    constructor(
      public target?: Element,
      public keyframes?: unknown,
      public timing: { delay?: number; duration?: number } = {},
    ) {}
    getComputedTiming() {
      return {
        endTime: (this.timing.delay ?? 0) + (this.timing.duration ?? 0),
      };
    }
  };
  if (!document.timeline) {
    (document as any).timeline = { currentTime: 0 };
  }
  g.CSS ??= {};
  g.CSS.escape ??= (value: string) => value;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a beat stamped on the shared clock", () => {
  it("plays its sound at the stamp and its reveal after the output latency, however far apart the messages are handled", async () => {
    const page = makePage(0.05);
    const stamp = page.now() + 10;

    page.advance(2);
    await page.audio.onReceiveRequest(updateAudio(stamp));
    page.advance(30);
    await page.ui.onReceiveRequest(writeText(stamp));

    expect(page.player.start).toHaveBeenCalledTimes(1);
    const [when, , , offset] = page.player.start.mock.calls[0]!;
    // The stamp is 10 ms after the reading, which paired now with 2 s.
    expect(when).toBeCloseTo(2.01, 9);
    expect(offset).toBeUndefined();
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) {
      expect(animation.startTime).toBeCloseTo(stamp - ORIGIN + 50, 9);
    }
  });

  it("starts a beat delivered 40 ms after its stamp at once, 40 ms into its sound and its reveal", async () => {
    const page = makePage(0);
    const stamp = page.now() + 10;

    page.advance(50);
    await page.audio.onReceiveRequest(updateAudio(stamp));
    await page.ui.onReceiveRequest(writeText(stamp));

    const [when, , , offset] = page.player.start.mock.calls[0]!;
    expect(when).toBeCloseTo(page.context.currentTime, 9);
    expect(offset).toBeCloseTo(0.04, 9);
    const elapsed = document.timeline.currentTime as number;
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) {
      expect(elapsed - animation.startTime!).toBeCloseTo(40, 9);
    }
  });
});

describe("a stamped image write handled late", () => {
  it("keeps its content reveal on the beat's timeline after the wrapper stage", async () => {
    const page = makePage(0);
    const stamp = page.now() + 10;
    page.advance(50);
    const fade = (duration: number) => ({
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      timing: { duration },
    });
    await page.ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "portrait",
        instructions: [
          {
            control: "show",
            targetAnimations: [fade(0) as any],
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
        time: stamp,
      }),
    );
    const display = stamp - ORIGIN;
    // The wrapper takes no time, so the content starts at the stamp too, and
    // is as far into its reveal as the write is late.
    expect(animations.map((a) => a.startTime)).toEqual([display, display]);
  });
});

describe("a stamped audio update handled late", () => {
  it("keeps a delayed start on its own time when that time is still ahead", async () => {
    const page = makePage(0);
    const stamp = page.now() + 10;
    page.advance(50);
    await page.audio.onReceiveRequest(
      updateAudio(stamp, { after: 0.1, at: 0.5 }),
    );
    const [when, , , offset] = page.player.start.mock.calls[0]!;
    // 10 ms stamp + 100 ms after, from a reading at 2 s: 2.11 s, still ahead.
    expect(when).toBeCloseTo(2.11, 9);
    expect(offset).toBe(0.5);
  });

  it("starts a late `now` start that far into its sound too", async () => {
    const page = makePage(0);
    const stamp = page.now() + 10;
    page.advance(50);
    await page.audio.onReceiveRequest(updateAudio(stamp, { now: true }));
    const [when, , , offset] = page.player.start.mock.calls[0]!;
    expect(when).toBeCloseTo(page.context.currentTime, 9);
    expect(offset).toBeCloseTo(0.04, 9);
  });

  it("adds the lateness past a delayed start to the sound's own offset", async () => {
    const page = makePage(0);
    const stamp = page.now() + 10;
    page.advance(50);
    await page.audio.onReceiveRequest(
      updateAudio(stamp, { after: 0.02, at: 0.5 }),
    );
    const [when, , , offset] = page.player.start.mock.calls[0]!;
    // Due at 2.03 s, handled at 2.05 s: 20 ms into its sound.
    expect(when).toBeCloseTo(page.context.currentTime, 9);
    expect(offset).toBeCloseTo(0.52, 9);
  });

  it("waits a late cued start for the next cue after now, from its start", async () => {
    const page = makePage(0);
    const cueFrom = vi.fn((t: number) => t + 0.25);
    page.player.getNextCueTime = cueFrom;
    const stamp = page.now() + 10;
    page.advance(50);
    await page.audio.onReceiveRequest(updateAudio(stamp));
    const [when, , , offset] = page.player.start.mock.calls[0]!;
    expect(cueFrom).toHaveBeenCalledWith(page.context.currentTime);
    expect(when).toBeCloseTo(page.context.currentTime + 0.25, 9);
    expect(offset).toBeUndefined();
  });
});

describe("the audio clock reading", () => {
  it("follows an audio context that starts after connect, pauses and resumes, and the game clock does not jump", () => {
    let now = ORIGIN + 500;
    const context: AudioClockContext & {
      state: AudioContextState;
      currentTime: number;
    } = {
      state: "suspended",
      currentTime: 0,
      outputLatency: 0.02,
      getOutputTimestamp: () => ({
        contextTime: context.currentTime - 0.02,
        performanceTime: now - ORIGIN,
      }),
    };
    const clock = new AudioClock(ORIGIN, () => now);
    const gameClock = new Clock({ currentTime: now / 1000 }, () => 0);
    const pageSource = {
      get currentTime() {
        return now / 1000;
      },
    };
    gameClock.syncToClock(pageSource);

    // Connected before the context runs: the shared clock alone.
    expect(clock.setContext(context)).toEqual({ time: now, outputLatency: 0 });
    expect(clock.toContextTime(now + 10)).toBeUndefined();

    // The context starts later; the reading maps shared time onto it.
    now += 1000;
    context.state = "running";
    context.currentTime = 0.3;
    const before = (gameClock as any).getCurrentTime();
    gameClock.syncToClock(context);
    expect((gameClock as any).getCurrentTime()).toBeCloseTo(before, 9);
    expect(clock.read().outputLatency).toBe(0.02);
    expect(clock.toContextTime(now + 10)).toBeCloseTo(0.31, 9);

    // Suspended: its time stands still, so it has no reading.
    context.state = "suspended";
    expect(clock.read().contextTime).toBeUndefined();

    // Resumed two seconds later with its time where it stopped: a fresh
    // reading maps now onto that time, not two seconds past it.
    now += 2000;
    context.state = "running";
    const resumed = (gameClock as any).getCurrentTime();
    gameClock.syncToClock(context);
    expect((gameClock as any).getCurrentTime()).toBeCloseTo(resumed, 9);
    clock.read();
    expect(clock.toContextTime(now)).toBeCloseTo(0.3, 9);
  });
});

describe("an input event", () => {
  it("carries the moment it happened on the shared clock", () => {
    const event = new MouseEvent("click");
    const data = getEventData(event, ORIGIN) as { time: number };
    expect(Math.abs(data.time - ORIGIN - event.timeStamp)).toBeLessThan(0.1);
  });
});
