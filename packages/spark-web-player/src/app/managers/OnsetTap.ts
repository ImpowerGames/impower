/** The name the tap's processor registers under in an audio worklet. */
export const ONSET_TAP_PROCESSOR = "impower-onset-tap";

export interface OnsetTapOptions {
  /** A sample louder than this, in either direction, is sound. */
  threshold: number;
  /**
   * Frames of silence that must come before a sound for its first frame to
   * count as an onset. A click's own waveform crosses zero many times, so
   * without it every crossing back above the threshold would read as a new
   * click.
   */
  gapFrames: number;
}

export const DEFAULT_ONSET_TAP_OPTIONS: OnsetTapOptions = {
  threshold: 0.01,
  gapFrames: 2400,
};

/** The first frame of one sound, as the audio context rendered it. */
export interface Onset {
  /** The frame's index in the context's render stream. */
  frame: number;
  /** The same frame on the context's clock, in seconds. */
  contextTime: number;
  /** How loud that first sample was. */
  peak: number;
}

/**
 * The tap's processor, as the source an audio worklet loads. It runs on the
 * audio rendering thread and reads every sample of its input, so the frame it
 * reports is exact: `currentFrame` is the index of the first frame of each
 * render quantum, and the sample's position in the quantum is added to it.
 * It reports an onset as a message, and nothing else, so it costs the page
 * one message per sound.
 */
export const onsetTapSource = (name: string = ONSET_TAP_PROCESSOR): string => `
class OnsetTapProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = (options && options.processorOptions) || {};
    this.threshold = settings.threshold;
    this.gapFrames = settings.gapFrames;
    this.quiet = this.gapFrames;
  }
  process(inputs) {
    const channels = inputs[0] || [];
    if (channels.length === 0) {
      this.quiet += 128;
      return true;
    }
    const frames = channels[0].length;
    for (let i = 0; i < frames; i += 1) {
      let peak = 0;
      for (let c = 0; c < channels.length; c += 1) {
        const magnitude = Math.abs(channels[c][i]);
        if (magnitude > peak) {
          peak = magnitude;
        }
      }
      if (peak > this.threshold) {
        if (this.quiet >= this.gapFrames) {
          this.port.postMessage({ frame: currentFrame + i, peak });
        }
        this.quiet = 0;
      } else {
        this.quiet += 1;
      }
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(name)}, OnsetTapProcessor);
`;

/** The worklet registrations under way or done, one per context: a
 *  processor name can be registered only once in a context's worklet. */
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

const register = (context: BaseAudioContext): Promise<void> => {
  let registered = registrations.get(context);
  if (!registered) {
    const url = URL.createObjectURL(
      new Blob([onsetTapSource()], { type: "text/javascript" }),
    );
    registered = context.audioWorklet
      .addModule(url)
      .finally(() => URL.revokeObjectURL(url));
    registrations.set(context, registered);
    registered.catch(() => registrations.delete(context));
  }
  return registered;
};

/**
 * A sample-accurate tap on an audio node: it reports the frame index of the
 * first audible sample of every sound that passes through the node, on the
 * node's context clock (#683). `AudioProbe` samples its mixers once per
 * animation frame, which places a sound within about 16 ms; this places it
 * within one sample.
 *
 * The tap observes and outputs nothing. It is for development builds, where
 * the driver's timing measurements read it (`AudioProbe.startOnsetTap`).
 */
export class OnsetTap {
  protected _context: BaseAudioContext;

  protected _source: AudioNode;

  protected _node: AudioWorkletNode;

  protected _onsets: Onset[] = [];

  protected constructor(
    context: BaseAudioContext,
    source: AudioNode,
    node: AudioWorkletNode,
  ) {
    this._context = context;
    this._source = source;
    this._node = node;
    node.port.onmessage = (e: MessageEvent<{ frame: number; peak: number }>) => {
      const { frame, peak } = e.data;
      this._onsets.push({
        frame,
        contextTime: frame / context.sampleRate,
        peak,
      });
    };
  }

  /** Taps `source`, whose context must allow audio worklets. */
  static async create(
    context: BaseAudioContext,
    source: AudioNode,
    options: Partial<OnsetTapOptions> = {},
  ): Promise<OnsetTap> {
    await register(context);
    const node = new AudioWorkletNode(context, ONSET_TAP_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { ...DEFAULT_ONSET_TAP_OPTIONS, ...options },
    });
    source.connect(node);
    return new OnsetTap(context, source, node);
  }

  /** Every onset reported so far, oldest first. */
  get onsets(): readonly Onset[] {
    return this._onsets;
  }

  /** Forget the onsets reported so far. */
  clear(): void {
    this._onsets = [];
  }

  dispose(): void {
    try {
      this._source.disconnect(this._node);
    } catch {
      // Already disconnected, or the context has closed.
    }
    this._node.port.onmessage = null;
    this._node.port.close();
  }
}
