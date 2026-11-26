import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AudioClock } from "../src/app/AudioClock";
import { serveOpusDecoding, type OpusServingScope } from "../src/app/utils/opusFallback";
import { TONE } from "./oggOpusFixture";

type WorkerMode = "real" | "slow" | "silent" | "crash";

const SLOW_DECODE_MS = 8_000;

const counts = vi.hoisted(() => ({
  thisThread: 0,
  workers: 0,
  served: 0,
  terminated: 0,
  crash: [] as (() => void)[],
  mode: "real" as WorkerMode,
}));

vi.mock("../src/app/utils/opusFallback.worker", () => ({ default: "opus fallback worker" }));

vi.mock("../src/app/utils/opusFallback", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/app/utils/opusFallback")>();
  return {
    ...original,
    finishOggOpus: (bytes: Uint8Array) => {
      counts.thisThread++;
      return original.finishOggOpus(bytes);
    },
  };
});

class InProcessWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  protected _page: MessagePort;
  protected _worker: MessagePort;
  constructor() {
    counts.workers++;
    const { port1, port2 } = new MessageChannel();
    this._page = port1;
    this._worker = port2;
    const mode: WorkerMode = counts.mode;
    if (mode === "real" || mode === "slow") {
      let answered: Promise<unknown> = Promise.resolve();
      const answer = (message: unknown, transfer: Transferable[]) => {
        if (mode === "real") {
          port2.postMessage(message, transfer as any);
          return;
        }
        answered = answered
          .then(() => new Promise((resolve) => setTimeout(resolve, SLOW_DECODE_MS)))
          .then(() => port2.postMessage(message, transfer as any));
      };
      const scope = {
        set onmessage(handler: OpusServingScope["onmessage"]) {
          port2.onmessage = (event) => {
            counts.served++;
            handler?.(event as MessageEvent);
          };
        },
        get onmessage() {
          return null;
        },
        postMessage: answer,
      };
      serveOpusDecoding(scope as OpusServingScope);
    } else {
      port2.onmessage = () => undefined;
    }
    if (mode === "crash") {
      counts.crash.push(() =>
        this.onerror?.(Object.assign(new Event("error"), { error: new Error("worker crashed") }) as ErrorEvent),
      );
    }
    port1.onmessage = (event) => this.onmessage?.(event as MessageEvent);
  }
  postMessage(message: unknown, transfer?: Transferable[]) {
    this._page.postMessage(message, (transfer ?? []) as any);
  }
  terminate() {
    counts.terminated++;
    this._page.close();
    this._worker.close();
  }
}


class StandInBuffer {
  channels: Float32Array[];
  constructor(
    channels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  copyToChannel(source: Float32Array, channel: number, start = 0) {
    this.channels[channel]!.set(source, start);
  }
}

const clips = new Map<string, Uint8Array>();

const freshAudio = async () => {
  vi.resetModules();
  const { default: AudioManager } = await import("../src/app/managers/AudioManager");
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

const expectTone = (buffer: StandInBuffer) => {
  expect(buffer.length).toBe(48000);
  expect(crossingsPerSecond(buffer.channels[0]!.subarray(4800, 43200))).toBeCloseTo(880, -1);
  expect(crossingsPerSecond(buffer.channels[1]!.subarray(4800, 43200))).toBeCloseTo(1320, -1);
};

const pageThreadSamples = async () => {
  const { finishOggOpus } = await vi.importActual<typeof import("../src/app/utils/opusFallback")>(
    "../src/app/utils/opusFallback",
  );
  return (await finishOggOpus(TONE.slice())).channels;
};

beforeEach(() => {
  counts.thisThread = 0;
  counts.workers = 0;
  counts.served = 0;
  counts.terminated = 0;
  counts.crash = [];
  counts.mode = "real";
  clips.clear();
  vi.stubGlobal("fetch", async (src: string) => new Response(clips.get(src)!.slice()));
  vi.stubGlobal("Worker", InProcessWorker);
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: () => "blob:opus-fallback",
      revokeObjectURL: () => undefined,
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Opus clips the browser cannot decode (#2279, #2815)", () => {
  test("decode and finish off the main thread", async () => {
    const decode = await freshAudio();
    expectTone(await decode(TONE));
    expectTone(await decode(TONE));
    expect(counts.served).toBe(2);
    expect(counts.thisThread).toBe(0);
  });

  test("give the worker's buffer the same samples as decoding on the page", async () => {
    const decode = await freshAudio();
    const fromWorker = await decode(TONE);
    expect(counts.thisThread).toBe(0);
    const onPage = await pageThreadSamples();
    fromWorker.channels.forEach((channel, i) => expect(channel).toEqual(onPage[i]));
  });

  test("share one worker when several clips start together", async () => {
    const decode = await freshAudio();
    const buffers = await Promise.all([decode(TONE), decode(TONE), decode(TONE), decode(TONE)]);
    buffers.forEach((buffer) => expectTone(buffer));
    expect(counts.workers).toBe(1);
    expect(counts.served).toBe(4);
    expect(counts.thisThread).toBe(0);
  });

  test("keep a busy worker when clips queue behind long decodes", async () => {
    counts.mode = "slow";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const decode = await freshAudio();
    const queued = [decode(TONE), decode(TONE)];
    let done = 0;
    queued.forEach((clip) => clip.then(() => done++));
    while (done < queued.length) {
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(100);
    }
    for (const clip of queued) {
      expectTone(await clip);
    }
    expect(counts.served).toBe(2);
    expect(counts.thisThread).toBe(0);
    expect(counts.terminated).toBe(0);
  });

  test("retire the worker once it has been idle", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const decode = await freshAudio();
    const settled = async (clip: Promise<StandInBuffer>) => {
      let done = false;
      clip.then(() => (done = true));
      while (!done) {
        await new Promise((resolve) => setImmediate(resolve));
        await vi.advanceTimersByTimeAsync(0);
      }
      return clip;
    };
    expectTone(await settled(decode(TONE)));
    expect(counts.terminated).toBe(0);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(counts.terminated).toBe(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(counts.terminated).toBe(1);
    expectTone(await settled(decode(TONE)));
    expect(counts.workers).toBe(2);
    expect(counts.thisThread).toBe(0);
  });

  test("fall back to the main thread when the worker never answers", async () => {
    counts.mode = "silent";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const decode = await freshAudio();
    const first = decode(TONE);
    const second = decode(TONE);
    await vi.advanceTimersByTimeAsync(16_000);
    expectTone(await first);
    expectTone(await second);
    expect(counts.terminated).toBe(1);
    expect(counts.thisThread).toBe(2);
  });

  test("finish every pending clip when the worker crashes", async () => {
    counts.mode = "crash";
    const decode = await freshAudio();
    const first = decode(TONE);
    const second = decode(TONE);
    await vi.waitFor(() => expect(counts.workers).toBe(1));
    await vi.waitFor(() => expect(counts.crash).toHaveLength(1));
    counts.crash.forEach((crash) => crash());
    expectTone(await first);
    expectTone(await second);
    expect(counts.terminated).toBe(1);
    expect(counts.thisThread).toBe(2);
  });
});
