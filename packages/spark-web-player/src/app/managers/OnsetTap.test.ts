import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ONSET_TAP_OPTIONS,
  ONSET_TAP_PROCESSOR,
  OnsetTap,
  onsetTapSource,
  type OnsetTapOptions,
} from "./OnsetTap";

/**
 * The tap is what the driver's metronome reads each click's first audible
 * sample from (#683), so the frame it reports has to be the exact frame a
 * sound starts on. These tests run the processor's own worklet source in a
 * deterministic stand-in for an audio worklet's global scope and render a
 * known signal through it in 128-frame render quanta, as an audio context
 * does: a click placed at a chosen frame must come back as that frame.
 */

const QUANTUM = 128;

interface Posted {
  frame: number;
  peak: number;
}

/**
 * Loads the tap's worklet source and renders `channels` through it, one
 * render quantum at a time, from context frame `startFrame`. Every channel
 * must be the same length. Returns what the processor posted.
 */
const render = (
  channels: Float32Array[],
  {
    startFrame = 0,
    options = DEFAULT_ONSET_TAP_OPTIONS,
    silentQuanta = 0,
  }: {
    startFrame?: number;
    options?: OnsetTapOptions;
    /** Quanta with nothing connected, before the signal. */
    silentQuanta?: number;
  } = {},
): Posted[] => {
  const posted: Posted[] = [];
  class AudioWorkletProcessor {
    port = { postMessage: (message: Posted) => posted.push(message) };
  }
  let Processor: any;
  let currentFrame = startFrame;
  // The worklet scope provides `currentFrame` as a global, which the source
  // reads by its bare name.
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

/** One second of silence at 48 kHz. */
const silence = () => new Float32Array(48_000);

/** A click like the fixture's: full level on its first frame, then a
 *  decaying 1 kHz tone lasting `frames`. */
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
    // A context that has been running for ten seconds is on frame 480,000.
    const posted = render([addClick(silence(), 777)], { startFrame: 480_000 });

    expect(posted.map((p) => p.frame)).toEqual([480_777]);
  });

  it("reports a click on the first frame of a quantum", () => {
    const posted = render([addClick(silence(), 4 * QUANTUM)]);

    expect(posted.map((p) => p.frame)).toEqual([4 * QUANTUM]);
  });

  it("reports one onset for a sound, however often its waveform crosses zero", () => {
    // A tone crosses zero twice a cycle; each crossing back above the
    // threshold must not read as a new sound.
    const signal = silence();
    for (let i = 0; i < 9600; i += 1) {
      signal[3000 + i] = Math.sin((2 * Math.PI * 440 * i) / 48_000) * 0.5;
    }

    const posted = render([signal]);

    expect(posted).toHaveLength(1);
    // The sine's first sample is zero; its first audible one is the onset.
    expect(posted[0]!.frame).toBe(3001);
  });

  it("reports a second click once the silence before it is long enough", () => {
    const { gapFrames } = DEFAULT_ONSET_TAP_OPTIONS;
    const signal = addClick(silence(), 1000, 400);
    // Late enough that more than `gapFrames` of silence precede it.
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
    // Before the mixer first plays, the tap's input carries no channels.
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

  /** A context and worklet node that record what the tap does with them. */
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
    // A name registers once per worklet scope; a second registration throws.
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
