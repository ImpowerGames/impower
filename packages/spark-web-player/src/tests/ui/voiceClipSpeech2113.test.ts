import { afterEach, describe, expect, test } from "vitest";
import AudioPlayer from "../../../../spark-dom/src/classes/AudioPlayer";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";
import UIManager from "../../app/managers/UIManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { flushMicrotasks } from "./domTestHarness";

class StandInParam {
  constructor(public value: number) {}
  cancelScheduledValues() {}
  setValueAtTime(value: number) {
    this.value = value;
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
}

class StandInSource {
  detune = new StandInParam(0);
  playbackRate = new StandInParam(1);
  loop = false;
  buffer: unknown = null;
  startedAt?: number;
  protected listeners: (() => void)[] = [];
  addEventListener(_type: string, listener: () => void) {
    this.listeners.push(listener);
  }
  removeEventListener() {}
  connect() {}
  disconnect() {}
  start(when: number) {
    this.startedAt = when;
  }
  stop() {}
  end() {
    for (const listener of this.listeners.splice(0)) {
      listener.call(this);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TYPED: [number, number][] = [[0, 0.3]];

const makePage = (options: { running?: boolean } = {}) => {
  const sources: StandInSource[] = [];
  const context = {
    currentTime: 0,
    state: options.running === false ? "suspended" : "running",
    destination: {},
    createGain: () => ({ gain: new StandInParam(1), connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const source = new StandInSource();
      sources.push(source);
      return source;
    },
  };
  const overlay = document.createElement("div");
  document.body.appendChild(overlay);
  const app: any = {
    overlay,
    audioContext: context,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  const audio = new AudioManager(app);
  const ui = new UIManager(app);
  app.audio = audio;
  app.ui = ui;
  const morphs = MorphPlayback.for(overlay);
  morphs.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  ui.onUpdate({ elapsedTime: 0 } as any);
  let elapsed = 0;
  let paused = false;
  const clip = (key: string) => {
    const player = new AudioPlayer({ duration: 3 } as AudioBuffer, context as any);
    (audio as any).getAudioChannel("voice").set(key, player);
    return player;
  };
  return {
    context,
    sources,
    audio,
    ui,
    morphs,
    clip,
    frame(seconds: number) {
      context.currentTime += seconds;
      if (!paused) {
        elapsed += seconds;
      }
      ui.onUpdate({ elapsedTime: elapsed } as any);
    },
    async play(updates: Record<string, unknown>[]) {
      await audio.updateAudioPlayers({ channel: "voice", updates: updates as any });
    },
    say(params: Record<string, unknown>) {
      ui.onReceiveNotification({ jsonrpc: "2.0", method: "morph/speech", params } as any);
    },
    speaking() {
      const speech = (morphs as any).speech as { character?: string; spans: [number, number][] } | undefined;
      const now = morphs.now;
      return (
        speech?.character === "mia" &&
        speech.spans.some(([start, end]) => start <= now + 1e-9 && now < end)
      );
    },
    pause() {
      paused = true;
      ui.onPause();
      audio.onPause();
    },
    unpause() {
      paused = false;
      ui.onUnpause();
      audio.onUnpause();
    },
  };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a line's voice clip drives the speaker's speech (#2113)", () => {
  test("speech runs from the clip's start to its end, past the end of the typed text", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello", after: 0.5 }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.1);
    expect(page.speaking()).toBe(false);
    page.frame(0.5);
    expect(page.speaking()).toBe(true);
    page.frame(2);
    expect(page.speaking()).toBe(true);
    page.sources[0]!.end();
    await flushMicrotasks(5);
    page.frame(0.05);
    expect(page.speaking()).toBe(false);
  });

  test("speech continues after a skip shows the whole line, until the clip ends", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello" }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.1);
    page.say({ character: "mia", spans: [], voiced: true, revealed: true });
    page.frame(1);
    expect(page.speaking()).toBe(true);
    page.sources[0]!.end();
    await flushMicrotasks(5);
    page.frame(0.05);
    expect(page.speaking()).toBe(false);
  });

  test("a skip while the clip fades out keeps speech until the fade ends", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello" }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.5);
    await page.play([{ control: "stop", key: "mia_hello", over: 0.3 }]);
    page.frame(0.1);
    page.say({ character: "mia", spans: [], voiced: true, revealed: true });
    page.frame(0.1);
    expect(page.speaking()).toBe(true);
    await sleep(400);
    await flushMicrotasks(5);
    page.frame(0.05);
    expect(page.speaking()).toBe(false);
  });

  test("speech ends when the next line stops the clip", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello" }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(1);
    expect(page.speaking()).toBe(true);
    await page.play([{ control: "stop" }]);
    await sleep(60);
    await flushMicrotasks(5);
    page.frame(0.05);
    expect(page.speaking()).toBe(false);
  });

  test("a clip that could not load leaves the typed spans to drive the mouth", async () => {
    const page = makePage();
    await page.play([{ control: "start", key: "mia_hello" }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.1);
    expect(page.speaking()).toBe(true);
    page.frame(0.5);
    expect(page.speaking()).toBe(false);
  });

  test("a clip that cannot play because audio is not running leaves the typed spans to drive the mouth", async () => {
    const page = makePage({ running: false });
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello" }]);
    expect(page.sources).toHaveLength(1);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.1);
    expect(page.speaking()).toBe(true);
    page.frame(0.4);
    expect(page.speaking()).toBe(false);
  });

  test("a skip on a line whose clip failed ends the typed speech", async () => {
    const page = makePage();
    page.say({ character: "mia", spans: [[0, 2]], voiced: true });
    page.frame(0.1);
    expect(page.speaking()).toBe(true);
    page.say({ character: "mia", spans: [], voiced: true, revealed: true });
    page.frame(0.05);
    expect(page.speaking()).toBe(false);
  });

  test("a pause before a delayed clip starts keeps the mouth with the clip when play resumes", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello", after: 0.5 }]);
    page.say({ character: "mia", spans: [[0, 0.05]], voiced: true });
    page.frame(0.1);
    expect(page.speaking()).toBe(false);
    page.pause();
    page.frame(2);
    page.unpause();
    page.frame(0.05);
    expect(page.speaking()).toBe(true);
  });

  test("a pause before a delayed clip starts holds the mouth until the clip is due", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello", after: 3 }]);
    page.say({ character: "mia", spans: [[0, 0.05]], voiced: true });
    page.frame(0.1);
    page.pause();
    page.frame(1);
    page.unpause();
    page.frame(1);
    expect(page.speaking()).toBe(false);
    page.frame(1);
    expect(page.speaking()).toBe(true);
  });

  test("pausing the story pauses the clip and freezes the speech with it", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello" }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.5);
    const frozenAt = page.morphs.now;
    page.pause();
    expect(page.sources[0]!.playbackRate.value).toBe(0);
    page.frame(2);
    expect(page.morphs.now).toBe(frozenAt);
    expect(page.speaking()).toBe(true);
    page.unpause();
    expect(page.sources[0]!.playbackRate.value).toBe(1);
    page.frame(0.5);
    expect(page.morphs.now).toBeCloseTo(frozenAt + 0.5, 9);
    expect(page.speaking()).toBe(true);
  });

  test("a clip whose stop the line schedules for later drives speech until that stop", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([
      { control: "start", key: "mia_hello" },
      { control: "stop", key: "mia_hello", after: 0.2 },
    ]);
    page.say({ character: "mia", spans: [[0, 0.05]], voiced: true });
    page.frame(0.1);
    expect(page.speaking()).toBe(true);
    await sleep(300);
    await flushMicrotasks(5);
    page.frame(0.15);
    expect(page.speaking()).toBe(false);
  });

  test("a clip queued behind the first drives speech from its own start to its end", async () => {
    const page = makePage();
    page.clip("a");
    page.clip("b");
    void page.audio.updateAudioPlayers({
      channel: "voice",
      updates: [{ control: "start", key: "a" }, { control: "await" }, { control: "start", key: "b" }] as any,
    });
    await flushMicrotasks(5);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.5);
    expect(page.speaking()).toBe(true);
    expect(page.sources).toHaveLength(1);
    page.sources[0]!.end();
    await flushMicrotasks(10);
    expect(page.sources).toHaveLength(2);
    page.frame(0.2);
    expect(page.speaking()).toBe(true);
    page.frame(1);
    expect(page.speaking()).toBe(true);
    page.sources[1]!.end();
    await flushMicrotasks(5);
    page.frame(0.05);
    expect(page.speaking()).toBe(false);
  });

  test("a clip that starts after the line's speech was replaced does not speak for the new line", async () => {
    const page = makePage();
    page.clip("a");
    page.clip("b");
    void page.audio.updateAudioPlayers({
      channel: "voice",
      updates: [{ control: "start", key: "a" }, { control: "await" }, { control: "start", key: "b" }] as any,
    });
    await flushMicrotasks(5);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.5);
    page.say({ character: "mia", spans: [[0, 0.1]] });
    page.sources[0]!.end();
    await flushMicrotasks(10);
    expect(page.sources).toHaveLength(2);
    page.frame(0.5);
    expect(page.speaking()).toBe(false);
  });

  test("with several clips on voice, speech lasts while any of them is audible", async () => {
    const page = makePage();
    page.clip("a");
    page.clip("b");
    await page.play([
      { control: "start", key: "a" },
      { control: "start", key: "b" },
    ]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(1);
    page.sources[0]!.end();
    await flushMicrotasks(5);
    page.frame(0.05);
    expect(page.speaking()).toBe(true);
    page.sources[1]!.end();
    await flushMicrotasks(5);
    page.frame(0.05);
    expect(page.speaking()).toBe(false);
  });

  test("a clip played at zero volume still drives the speech", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello", to: 0 }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(1);
    expect(page.speaking()).toBe(true);
  });

  test("a clip ending after the next line has begun leaves that line's speech alone", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello" }]);
    page.say({ character: "mia", spans: TYPED, voiced: true });
    page.frame(0.5);
    page.say({ character: "mia", spans: [[0, 1]] });
    page.frame(0.1);
    page.sources[0]!.end();
    await flushMicrotasks(5);
    page.frame(0.1);
    expect(page.speaking()).toBe(true);
  });

  test("a line that is not voiced ignores a clip still on voice", async () => {
    const page = makePage();
    page.clip("mia_hello");
    await page.play([{ control: "start", key: "mia_hello" }]);
    page.say({ character: "mia", spans: TYPED });
    page.frame(0.5);
    expect(page.speaking()).toBe(false);
  });
});
