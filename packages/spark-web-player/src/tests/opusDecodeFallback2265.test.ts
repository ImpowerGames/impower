import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../app/AudioClock";
import AudioManager from "../app/managers/AudioManager";

const TONE = readFileSync(join(__dirname, "fixtures", "tone-opus.ogg"));
const TONE_FRAMES = 48000;

class StandInBuffer {
  channels: Float32Array[];
  constructor(
    channels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  get numberOfChannels() {
    return this.channels.length;
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  copyToChannel(source: Float32Array, channel: number) {
    this.channels[channel]!.set(source);
  }
}

const makeContext = (decodeAudioData: (bytes: ArrayBuffer) => Promise<unknown>) => ({
  sampleRate: 44100,
  createBuffer: (channels: number, length: number, sampleRate: number) =>
    new StandInBuffer(channels, length, sampleRate),
  decodeAudioData,
});

const opusUnsupported = () =>
  Promise.reject(new DOMException("Unable to decode audio data", "EncodingError"));

const load = (context: unknown, bytes: Uint8Array) => {
  vi.stubGlobal("fetch", async () => new Response(bytes.slice()));
  const app: any = {
    audioContext: context,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  return new AudioManager(app).decodeAudioBuffer({
    key: "tone",
    src: "https://file+.vscode-resource.vscode-cdn.net/tone-opus.ogg",
  } as any) as Promise<unknown>;
};

const crossingsPerSecond = (samples: Float32Array, sampleRate: number) => {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1]! < 0 !== samples[i]! < 0) {
      crossings++;
    }
  }
  return crossings / (samples.length / sampleRate);
};

const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an Ogg Opus clip in a webview whose decoder has no Opus (#2265)", () => {
  test("decodes to the clip's audio instead of rejecting", async () => {
    const buffer = (await load(makeContext(opusUnsupported), TONE)) as StandInBuffer;

    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(48000);
    expect(buffer.length).toBe(TONE_FRAMES);
    const [left, right] = buffer.channels.map((c) => c.subarray(4800, 43200));
    expect(rms(left!)).toBeGreaterThan(0.3);
    expect(rms(right!)).toBeGreaterThan(0.3);
    expect(crossingsPerSecond(left!, 48000)).toBeCloseTo(880, -1);
    expect(crossingsPerSecond(right!, 48000)).toBeCloseTo(1320, -1);
  });

  test("keeps the browser's own decode when it succeeds", async () => {
    const native = { native: true };
    const decoded = await load(makeContext(async () => native), TONE);
    expect(decoded).toBe(native);
  });

  test("still rejects a clip that is not Ogg Opus", async () => {
    await expect(
      load(makeContext(opusUnsupported), new TextEncoder().encode("not audio")),
    ).rejects.toThrow("Unable to decode audio data");
  });
});
