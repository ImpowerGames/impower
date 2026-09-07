/** An instantaneous reading of what a mixer is actually outputting. */
export interface AudioLevels {
  /** Loudest sample magnitude in the current window. Catches a single click. */
  peak: number;
  /** Root mean square over the window. Catches sustained tone. */
  rms: number;
}

const SILENT: AudioLevels = { peak: 0, rms: 0 };

export default class AudioMixer {
  protected _audioContext: AudioContext;
  public get context(): AudioContext {
    return this._audioContext;
  }

  protected _volumeNode: GainNode;
  public get volumeNode(): GainNode {
    return this._volumeNode;
  }

  /**
   * Sits between the gain node and the destination, so what it reads is what
   * this mixer is actually sending on -- AFTER its own gain. Reading before
   * the gain would report a healthy signal for a mixer muted to zero, which
   * is exactly the failure worth catching.
   *
   * An AnalyserNode is a pass-through: it observes without altering the
   * signal, so this is safe to leave in place rather than wiring it up only
   * when something is watching.
   */
  protected _analyser: AnalyserNode;
  public get analyser(): AnalyserNode {
    return this._analyser;
  }

  /** Scratch buffer, reused so that polling every frame allocates nothing. */
  protected _samples: Float32Array<ArrayBuffer>;

  protected _gain = 1;
  public get gain() {
    return this._gain;
  }
  public set gain(value: number) {
    this._gain = value;
    this._volumeNode.gain.value = value;
  }

  constructor(audioContext: AudioContext, destination?: AudioNode) {
    this._audioContext = audioContext;
    this._volumeNode = this._audioContext.createGain();
    this._analyser = this._audioContext.createAnalyser();
    // Small enough to respond to a short beep rather than smearing it across
    // a long window; large enough to be a stable reading.
    this._analyser.fftSize = 2048;
    this._samples = new Float32Array(this._analyser.fftSize);
    this._volumeNode.connect(this._analyser);
    this._analyser.connect(destination ?? this._audioContext.destination);
  }

  /** Measures what is passing through this mixer right now. */
  readLevels(): AudioLevels {
    if (!this._analyser.getFloatTimeDomainData) {
      return SILENT;
    }
    this._analyser.getFloatTimeDomainData(this._samples);
    let peak = 0;
    let sumOfSquares = 0;
    for (let i = 0; i < this._samples.length; i += 1) {
      const sample = this._samples[i]!;
      const magnitude = Math.abs(sample);
      if (magnitude > peak) {
        peak = magnitude;
      }
      sumOfSquares += sample * sample;
    }
    return { peak, rms: Math.sqrt(sumOfSquares / this._samples.length) };
  }
}
