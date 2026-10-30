import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ONSET_TAP_OPTIONS,
  ONSET_TAP_PROCESSOR,
  OnsetTap,
  onsetTapSource,
  type OnsetTapOptions,
} from "./OnsetTap";

const QUANTUM = 128;

interface Posted {
  frame: number;
  peak: number;
}

const render = (
  channels: Float32Array[],
  {
    startFrame = 0,
    options = DEFAULT_ONSET_TAP_OPTIONS,
    silentQuanta = 0,
  }: {
    startFrame?: number;
    options?: OnsetTapOptions;
    silentQuanta?: number;
  } = {},
): Posted[] => {
  const posted: Posted[] = [];
  class AudioWorkletProcessor {
    port = { postMessage: (message: Posted) => posted.push(message) };
  }
  let Processor: any;
  let currentFrame = startFrame;
  Object.defineProperty(globalThis, "currentFrame", {
    configurable: true,
    get: () => currentFrame,
  });
  try {
    new Function(
      "AudioWorkletProcessor",
      "registerProcessor",
      onsetTapSource(),
    )(AudioWorkletProcessor, (name: string, processor: unknown) => {
      expect(name).toBe(ONSET_TAP_PROCESSOR);
      Processor = processor;
    });
    const processor = new Processor({ processorOptions: options });
    for (let i = 0; i < silentQuanta; i += 1) {
      processor.process([[]]);
      currentFrame += QUANTUM;
    }
    const length = channels[0]!.length;
    for (let at = 0; at < length; at += QUANTUM) {
      processor.process([channels.map((c) => c.subarray(at, at + QUANTUM))]);
      currentFrame += QUANTUM;
    }
  } finally {
    delete (globalThis as { currentFrame?: number }).currentFrame;
  }
  return posted;
};

const silence = () => new Float32Array(48_000);

const addClick = (signal: Float32Array, at: number, frames = 1920) => {
  for (let i = 0; i < frames && at + i < signal.length; i += 1) {
    const envelope = Math.exp(-i / 192);
    signal[at + i] =
      i === 0 ? 0.9 : Math.sin((2 * Math.PI * 1000 * i) / 48_000) * 0.9 * envelope;
  }
  return signal;
};

describe("the onset tap's processor", () => {
  it("reports a click at the frame it starts on, inside a render quantum", () => {
    const frame = 12_345;
    expect(frame % QUANTUM).not.toBe(0);

    const posted = render([addClick(silence(), frame)]);

    expect(posted.map((p) => p.frame)).toEqual([frame]);
    expect(posted[0]!.peak).toBeCloseTo(0.9);
  });

  it("counts frames from wherever the context's render stream is", () => {
    const posted = render([addClick(silence(), 777)], { startFrame: 480_000 });

    expect(posted.map((p) => p.frame)).toEqual([480_777]);
  });

  it("reports a click on the first frame of a quantum", () => {
    const posted = render([addClick(silence(), 4 * QUANTUM)]);

    expect(posted.map((p) => p.frame)).toEqual([4 * QUANTUM]);
  });

  it("reports one onset for a sound, however often its waveform crosses zero", () => {
    const signal = silence();
    for (let i = 0; i < 9600; i += 1) {
      signal[3000 + i] = Math.sin((2 * Math.PI * 440 * i) / 48_000) * 0.5;
    }

    const posted = render([signal]);

    expect(posted).toHaveLength(1);
    expect(posted[0]!.frame).toBe(3001);
  });

  it("reports a second click once the silence before it is long enough", () => {
    const { gapFrames } = DEFAULT_ONSET_TAP_OPTIONS;
    const signal = addClick(silence(), 1000, 400);
    const second = 1000 + 400 + gapFrames + 50;
    addClick(signal, second, 400);

    const posted = render([signal]);

    expect(posted.map((p) => p.frame)).toEqual([1000, second]);
  });

  it("takes a sound after a shorter silence as part of the one before", () => {
    const signal = addClick(silence(), 1000, 400);
    addClick(signal, 2000, 400);

    const posted = render([signal]);

    expect(posted.map((p) => p.frame)).toEqual([1000]);
  });

  it("ignores anything quieter than its threshold", () => {
    const signal = silence();
    for (let i = 0; i < signal.length; i += 1) {
      signal[i] = (i % 2 ? 1 : -1) * DEFAULT_ONSET_TAP_OPTIONS.threshold * 0.5;
    }

    expect(render([signal])).toEqual([]);
  });

  it("hears a sound on any channel", () => {
    const left = silence();
    const right = addClick(silence(), 20_000);

    const posted = render([left, right]);

    expect(posted.map((p) => p.frame)).toEqual([20_000]);
  });

  it("counts quanta with nothing connected as silence before the first sound", () => {
    const posted = render([addClick(silence(), 50)], {
      silentQuanta: 3,
      startFrame: 0,
    });

    expect(posted.map((p) => p.frame)).toEqual([3 * QUANTUM + 50]);
  });
});

describe("OnsetTap", () => {
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  afterEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    delete (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode;
  });

  const fakes = () => {
    const addModule = vi.fn(async (_url: string) => {});
    const context = {
      sampleRate: 48_000,
      audioWorklet: { addModule },
    } as unknown as BaseAudioContext;
    const nodes: {
      options: AudioWorkletNodeOptions;
      port: { onmessage: ((e: MessageEvent) => void) | null; close: () => void };
    }[] = [];
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {
      port = { onmessage: null, close: vi.fn() };
      constructor(_context: unknown, name: string, options: AudioWorkletNodeOptions) {
        expect(name).toBe(ONSET_TAP_PROCESSOR);
        nodes.push({ options, port: this.port });
      }
    };
    URL.createObjectURL = vi.fn(() => "blob:tap");
    URL.revokeObjectURL = vi.fn();
    const source = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
    return { context, addModule, nodes, source };
  };

  it("reports each onset on the context's clock", async () => {
    const { context, nodes, source } = fakes();

    const tap = await OnsetTap.create(context, source);
    nodes[0]!.port.onmessage!({
      data: { frame: 96_000, peak: 0.5 },
    } as MessageEvent);

    expect(source.connect).toHaveBeenCalled();
    expect(tap.onsets).toEqual([{ frame: 96_000, contextTime: 2, peak: 0.5 }]);
  });

  it("passes the processor its options, over the defaults", async () => {
    const { context, nodes, source } = fakes();

    await OnsetTap.create(context, source, { threshold: 0.2 });

    expect(nodes[0]!.options.processorOptions).toEqual({
      ...DEFAULT_ONSET_TAP_OPTIONS,
      threshold: 0.2,
    });
    expect(nodes[0]!.options.numberOfOutputs).toBe(0);
  });

  it("loads the processor into a context once, however many taps it has", async () => {
    const { context, addModule, source } = fakes();

    await OnsetTap.create(context, source);
    await OnsetTap.create(context, source);

    expect(addModule).toHaveBeenCalledTimes(1);
  });

  it("stops listening when disposed", async () => {
    const { context, nodes, source } = fakes();
    const tap = await OnsetTap.create(context, source);

    tap.dispose();

    expect(source.disconnect).toHaveBeenCalled();
    expect(nodes[0]!.port.onmessage).toBeNull();
    expect(nodes[0]!.port.close).toHaveBeenCalled();
  });
});
