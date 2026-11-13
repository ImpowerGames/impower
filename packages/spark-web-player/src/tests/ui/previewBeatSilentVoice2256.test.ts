import { afterEach, describe, expect, test } from "vitest";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";
import UIManager from "../../app/managers/UIManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { flushMicrotasks } from "./domTestHarness";

const CLIP_SECONDS = 2.5;

const HELLO = {
  load: {
    channel: "voice",
    key: "mia_hello",
    src: "https://example.com/mia_hello.wav",
  },
  after: 0.5,
};

const makePreview = () => {
  const overlay = document.createElement("div");
  document.body.appendChild(overlay);
  const scheduled: unknown[] = [];
  const decoded: string[] = [];
  const app: any = {
    overlay,
    audioContext: undefined,
    audioClock: new AudioClock(0, () => 0),
    assets: {
      cache: {
        getAudio: (key: string) => {
          decoded.push(key);
          return { duration: CLIP_SECONDS };
        },
      },
    },
    emit: (message: unknown) => scheduled.push(message),
  };
  const audio = new AudioManager(app);
  const ui = new UIManager(app);
  app.audio = audio;
  app.ui = ui;
  const morphs = MorphPlayback.for(overlay);
  morphs.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  return {
    morphs,
    decoded,
    scheduled,
    say(params: Record<string, unknown>) {
      ui.onReceiveNotification({
        jsonrpc: "2.0",
        method: "morph/speech",
        params,
      } as any);
    },
    spans() {
      const speech = (morphs as any).speech as
        | { character?: string; spans: [number, number][] }
        | undefined;
      return speech?.character === "mia" ? speech.spans : [];
    },
    speakingAt(seconds: number) {
      return this.spans().some(
        ([start, end]) => start <= seconds + 1e-9 && seconds < end,
      );
    },
  };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a voiced line played in the stopped preview (#2256)", () => {
  test("its mouth follows the clip's length, silently, not the typed text", async () => {
    const preview = makePreview();
    preview.say({
      character: "mia",
      spans: [[0, 0.3]],
      voiced: true,
      clips: [HELLO],
    });
    await flushMicrotasks(10);
    expect(preview.decoded).toEqual(["mia_hello"]);
    const [span] = preview.spans();
    expect(preview.spans()).toHaveLength(1);
    expect(span![0] - preview.morphs.now).toBeCloseTo(HELLO.after, 6);
    expect(span![1] - span![0]).toBeCloseTo(CLIP_SECONDS, 6);
    expect(preview.speakingAt(preview.morphs.now + 2)).toBe(true);
    expect(preview.speakingAt(preview.morphs.now + 3.1)).toBe(false);
    expect(preview.scheduled).toEqual([]);
  });

  test("when the beat ends on its own, the still keeps the mouth on the clip until the clip's length", async () => {
    const preview = makePreview();
    preview.morphs.setEnabled(false);
    preview.morphs.setPlaying(true);
    preview.say({
      character: "mia",
      spans: [[0, 0.3]],
      voiced: true,
      clips: [HELLO],
    });
    await flushMicrotasks(10);
    const before = preview.spans();
    preview.say({ character: "mia", spans: [], voiced: true, revealed: true });
    preview.morphs.setPlaying(false);
    expect(preview.spans()).toEqual(before);
    expect(preview.morphs.animating).toBe(true);
    preview.morphs.advance(HELLO.after + CLIP_SECONDS - 0.1);
    expect(preview.morphs.animating).toBe(true);
    preview.morphs.advance(0.2);
    expect(preview.morphs.animating).toBe(false);
  });

  test("a click or a later preview rests the mouth at once, even before the clip's length is known", async () => {
    const preview = makePreview();
    preview.morphs.setEnabled(false);
    preview.morphs.setPlaying(true);
    preview.say({
      character: "mia",
      spans: [[0, 0.3]],
      voiced: true,
      clips: [HELLO],
    });
    preview.say({ character: "mia", spans: [] });
    preview.morphs.setPlaying(false);
    await flushMicrotasks(10);
    expect(preview.spans()).toEqual([]);
    expect(preview.morphs.animating).toBe(false);
  });

  test("an unvoiced still after the play rests the mouth", async () => {
    const preview = makePreview();
    preview.say({ character: "mia", spans: [[0, 0.3]] });
    expect(preview.spans().length).toBeGreaterThan(0);
    preview.say({ character: "mia", spans: [] });
    expect(preview.spans()).toEqual([]);
  });
});
