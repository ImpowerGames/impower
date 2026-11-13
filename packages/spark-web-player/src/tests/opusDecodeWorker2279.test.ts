import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../app/AudioClock";
import AudioManager from "../app/managers/AudioManager";

const mainThreadDecoders = vi.hoisted(() => ({ created: 0 }));

vi.mock("opus-decoder", async (importOriginal) => {
  const original = await importOriginal<typeof import("opus-decoder")>();
  class CountedOpusDecoder extends original.OpusDecoder {
    constructor(options?: Parameters<typeof Object.assign>[1]) {
      super(options);
      mainThreadDecoders.created++;
    }
  }
  return { ...original, OpusDecoder: CountedOpusDecoder };
});

const TONE = readFileSync(join(__dirname, "fixtures", "tone-opus.ogg"));

class StandInBuffer {
  channels: Float32Array[];
  constructor(
    channels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  copyToChannel(source: Float32Array, channel: number) {
    this.channels[channel]!.set(source);
  }
}

const decode = () => {
  vi.stubGlobal("fetch", async () => new Response(TONE.slice()));
  const context = {
    sampleRate: 48000,
    createBuffer: (channels: number, length: number, sampleRate: number) =>
      new StandInBuffer(channels, length, sampleRate),
    decodeAudioData: () =>
      Promise.reject(new DOMException("Unable to decode audio data", "EncodingError")),
  };
  const app: any = { audioContext: context, audioClock: new AudioClock(0, () => 0), emit: () => {} };
  return new AudioManager(app).decodeAudioBuffer({
    key: "tone",
    src: "https://file+.vscode-resource.vscode-cdn.net/tone-opus.ogg",
  } as any) as Promise<unknown> as Promise<StandInBuffer>;
};

const crossingsPerSecond = (samples: Float32Array) => {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1]! < 0 !== samples[i]! < 0) {
      crossings++;
    }
  }
  return crossings / (samples.length / 48000);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Opus clips the browser cannot decode (#2279)", () => {
  test("decode off the main thread", async () => {
    const first = await decode();
    const second = await decode();

    expect(mainThreadDecoders.created).toBe(0);
    for (const buffer of [first, second]) {
      expect(buffer.length).toBe(48000);
      expect(crossingsPerSecond(buffer.channels[0]!.subarray(4800, 43200))).toBeCloseTo(880, -1);
      expect(crossingsPerSecond(buffer.channels[1]!.subarray(4800, 43200))).toBeCloseTo(1320, -1);
    }
  });
});
