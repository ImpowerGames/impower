export const ONSET_TAP_PROCESSOR = "impower-onset-tap";

export interface OnsetTapOptions {
  threshold: number;
  gapFrames: number;
}

export const DEFAULT_ONSET_TAP_OPTIONS: OnsetTapOptions = {
  threshold: 0.01,
  gapFrames: 2400,
};

export interface Onset {
  frame: number;
  contextTime: number;
  peak: number;
}

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

  get onsets(): readonly Onset[] {
    return this._onsets;
  }

  clear(): void {
    this._onsets = [];
  }

  dispose(): void {
    try {
      this._source.disconnect(this._node);
    } catch {
    }
    this._node.port.onmessage = null;
    this._node.port.close();
  }
}
