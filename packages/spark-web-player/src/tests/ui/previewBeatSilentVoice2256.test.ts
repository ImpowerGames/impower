import { afterEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";

const LENGTHS: Record<string, number> = { mia_hello: 2.5, mia_second: 3 };

const clip = (key: string) => ({
  channel: "voice",
  key,
  src: `https://example.com/${key}.wav`,
});

const makePage = () => {
  const decoded: string[] = [];
  const app: any = {
    overlay: document.createElement("div"),
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
    emit: () => {},
  };
  const audio = new AudioManager(app);
  return {
    decoded,
    measure: (keys: string[]) =>
      audio.onReceiveRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "audio/measure",
        params: { clips: keys.map(clip) },
      } as any),
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("measuring the voice clips of a beat played silently in the stopped preview (#2256)", () => {
  test("answers each clip's decoded length in order, without playing anything", async () => {
    const page = makePage();
    const answer: any = await page.measure(["mia_hello", "mia_second"]);
    expect(answer.result).toEqual({ durations: [2.5, 3] });
    expect(page.decoded).toEqual(["mia_hello", "mia_second"]);
  });

  test("a clip that cannot be measured answers null and is reported with its key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const page = makePage();
    const answer: any = await page.measure(["mia_missing", "mia_hello"]);
    expect(answer.result).toEqual({ durations: [null, 2.5] });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("mia_missing"),
      expect.anything(),
    );
  });
});
