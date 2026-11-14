import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../app/AudioClock";

type WorkerMode = "real" | "silent" | "crash";

const decoders = vi.hoisted(() => ({
  mainThread: 0,
  workers: 0,
  terminated: 0,
  crash: [] as (() => void)[],
  mode: (_preSkip: number): WorkerMode => "real",
}));

vi.mock("opus-decoder", async (importOriginal) => {
  const original = await importOriginal<typeof import("opus-decoder")>();
  class CountedOpusDecoder extends original.OpusDecoder {
    constructor(options?: Parameters<typeof Object.assign>[1]) {
      super(options);
      decoders.mainThread++;
    }
  }
  function ControlledWorker(options: { preSkip: number }) {
    decoders.workers++;
    const mode = decoders.mode(options.preSkip);
    if (mode === "real") {
      return new original.OpusDecoderWebWorker(options);
    }
    const never = () => new Promise<never>(() => undefined);
    const worker = Object.assign(new EventTarget(), {
      ready: never(),
      reset: never,
      decodeFrames: never,
      terminate: () => {
        decoders.terminated++;
      },
    });
    if (mode === "crash") {
      decoders.crash.push(() => {
        const event = new Event("error");
        Object.assign(event, { error: new Error("worker crashed") });
        worker.dispatchEvent(event);
      });
    }
    return worker;
  }
  return { ...original, OpusDecoder: CountedOpusDecoder, OpusDecoderWebWorker: ControlledWorker };
});

const TONE = new Uint8Array(readFileSync(join(__dirname, "fixtures", "tone-opus.ogg")));
const PRE_SKIP_OFFSET = 28 + 10;

const withPreSkip = (preSkip: number) => {
  const bytes = TONE.slice();
  new DataView(bytes.buffer).setUint16(PRE_SKIP_OFFSET, preSkip, true);
  return bytes;
};

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

const clips = new Map<string, Uint8Array>();

const freshAudio = async () => {
  vi.resetModules();
  const { default: AudioManager } = await import("../app/managers/AudioManager");
  const context = {
    sampleRate: 48000,
    createBuffer: (channels: number, length: number, sampleRate: number) =>
      new StandInBuffer(channels, length, sampleRate),
    decodeAudioData: () =>
      Promise.reject(new DOMException("Unable to decode audio data", "EncodingError")),
  };
  const app: any = { audioContext: context, audioClock: new AudioClock(0, () => 0), emit: () => {} };
  const audio = new AudioManager(app);
  return (bytes: Uint8Array) => {
    const src = `clip-${clips.size}`;
    clips.set(src, bytes);
    return audio.decodeAudioBuffer({ key: src, src } as any) as Promise<unknown> as Promise<StandInBuffer>;
  };
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

const expectTone = (buffer: StandInBuffer, length = 48000) => {
  expect(buffer.length).toBe(length);
  expect(crossingsPerSecond(buffer.channels[0]!.subarray(4800, 43200))).toBeCloseTo(880, -1);
  expect(crossingsPerSecond(buffer.channels[1]!.subarray(4800, 43200))).toBeCloseTo(1320, -1);
};

beforeEach(() => {
  decoders.mainThread = 0;
  decoders.workers = 0;
  decoders.terminated = 0;
  decoders.crash = [];
  decoders.mode = () => "real";
  clips.clear();
  vi.stubGlobal("fetch", async (src: string) => new Response(clips.get(src)!.slice()));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Opus clips the browser cannot decode (#2279)", () => {
  test("decode off the main thread", async () => {
    const decode = await freshAudio();
    expectTone(await decode(TONE));
    expectTone(await decode(TONE));
    expect(decoders.mainThread).toBe(0);
  });

  test("share one worker when several clips with the same layout start together", async () => {
    const decode = await freshAudio();
    const buffers = await Promise.all([decode(TONE), decode(TONE), decode(TONE), decode(TONE)]);
    buffers.forEach((buffer) => expectTone(buffer));
    expect(decoders.workers).toBe(1);
    expect(decoders.mainThread).toBe(0);
  });

  test("fall back to the main thread when a worker never answers", async () => {
    decoders.mode = () => "silent";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const decode = await freshAudio();
    const first = decode(TONE);
    const second = decode(TONE);
    await vi.advanceTimersByTimeAsync(16_000);
    expectTone(await first);
    expectTone(await second);
    expect(decoders.terminated).toBe(1);
  });

  test("finish every pending clip when one layout's worker crashes", async () => {
    decoders.mode = (preSkip) => (preSkip === 312 ? "crash" : "silent");
    const decode = await freshAudio();
    const crashed = decode(TONE);
    const otherLayout = decode(withPreSkip(313));
    await vi.waitFor(() => expect(decoders.workers).toBe(2));
    decoders.crash.forEach((crash) => crash());
    expectTone(await crashed);
    expectTone(await otherLayout, 47999);
    expect(decoders.terminated).toBe(2);
  });
});
