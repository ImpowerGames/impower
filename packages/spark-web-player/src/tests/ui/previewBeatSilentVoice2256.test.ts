import { afterEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";
import UIManager from "../../app/managers/UIManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { flushMicrotasks } from "./domTestHarness";

const LENGTHS: Record<string, number> = {
  mia_hello: 2.5,
  mia_first: 2,
  mia_second: 3,
};

const clip = (key: string, after: number, queued = false) => ({
  load: { channel: "voice", key, src: `https://example.com/${key}.wav` },
  after,
  ...(queued ? { queued: true } : {}),
});

const HELLO = clip("mia_hello", 0.5);

const makePreview = () => {
  const overlay = document.createElement("div");
  document.body.appendChild(overlay);
  const sent: any[] = [];
  const decoded: string[] = [];
  const app: any = {
    overlay,
    audioContext: undefined,
    audioClock: new AudioClock(0, () => 0),
    assets: {
      cache: {
        getAudio: (key: string) => {
          decoded.push(key);
          if (!(key in LENGTHS)) {
            throw new Error("not decodable");
          }
          return { duration: LENGTHS[key] };
        },
      },
    },
    emit: (message: unknown) => sent.push(message),
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
    sent,
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
      return (speech?.character === "mia" ? speech.spans : []).map(
        ([start, end]): [number, number] => [start - morphs.now, end - morphs.now],
      );
    },
    measured() {
      return sent.filter((m) => m?.method === "morph/speechMeasured");
    },
  };
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("a voiced line played in the stopped preview (#2256)", () => {
  test("its mouth follows the clip's length, silently, and the game is told when the clip ends", async () => {
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
    expect(span![0]).toBeCloseTo(0.5, 6);
    expect(span![1]).toBeCloseTo(3, 6);
    expect(preview.sent.filter((m) => m?.method?.startsWith("audio/"))).toEqual([]);
    expect(preview.measured().map((m) => m.params.end)).toEqual([3]);
  });

  test("a queued clip starts when the one before it ends", async () => {
    const preview = makePreview();
    preview.say({
      character: "mia",
      spans: [[0, 0.3]],
      voiced: true,
      clips: [clip("mia_first", 0), clip("mia_second", 0, true)],
    });
    await flushMicrotasks(10);
    const spans = preview.spans();
    expect(spans).toHaveLength(2);
    expect(spans[1]![0]).toBeCloseTo(2, 6);
    expect(spans[1]![1]).toBeCloseTo(5, 6);
    expect(preview.measured().map((m) => m.params.end)).toEqual([5]);
  });

  test("a clip that cannot be measured is reported and left out, and the game still hears when the speech ends", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const preview = makePreview();
    preview.say({
      character: "mia",
      spans: [[0, 0.3]],
      voiced: true,
      clips: [clip("mia_missing", 0), HELLO],
    });
    await flushMicrotasks(10);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("mia_missing"),
      expect.anything(),
    );
    expect(preview.spans()).toHaveLength(1);
    expect(preview.measured().map((m) => m.params.end)).toEqual([3]);
  });

  test("a click or a later preview rests the mouth at once, before the clip's length is known, and nothing is measured", async () => {
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
    expect(preview.measured()).toEqual([]);
  });

  test("an unvoiced still after the play rests the mouth", async () => {
    const preview = makePreview();
    preview.say({ character: "mia", spans: [[0, 0.3]] });
    expect(preview.spans().length).toBeGreaterThan(0);
    preview.say({ character: "mia", spans: [] });
    expect(preview.spans()).toEqual([]);
  });
});
