import { Synth } from "../../types/Synth";
import { Tone } from "../../types/Tone";
import { fillArrayWithTones } from "../../utils/fillArrayWithTones";

export class SynthBuffer {
  protected _tones: Tone[];
  public get tones(): readonly Tone[] {
    return this._tones;
  }

  protected _soundBuffer: Float32Array;
  public get soundBuffer(): Float32Array {
    return this._soundBuffer;
  }

  protected _volumeBuffer: Float32Array;
  public get volumeBuffer(): Float32Array {
    return this._volumeBuffer;
  }

  protected _pitchBuffer: Float32Array;
  public get pitchBuffer(): Float32Array {
    return this._pitchBuffer;
  }

  protected _pitchRange: [number, number];
  public get pitchRange(): [number, number] {
    return this._pitchRange;
  }

  protected _durationInSamples: number;
  public get durationInSamples(): number {
    return this._durationInSamples;
  }

  public get length(): number {
    return this._soundBuffer.length;
  }

  constructor(synth: Synth, tones: Tone[], sampleRate: number) {
    this._tones = tones;
    const duration =
      tones?.length > 0
        ? Math.max(
            ...tones.map(
              (t) =>
                (t?.time ?? 0) +
                (t?.duration ??
                  (synth?.envelope?.attack ?? 0) +
                    (synth?.envelope?.decay ?? 0) +
                    (synth?.envelope?.sustain ?? 0) +
                    (synth?.envelope?.release ?? 0)) /
                  (t?.speed ?? 1)
            )
          )
        : 0;
    this._durationInSamples = Math.max(1, sampleRate * duration);
    this._soundBuffer = new Float32Array(this._durationInSamples);
    this._volumeBuffer = new Float32Array(this._durationInSamples);
    this._pitchBuffer = new Float32Array(this._durationInSamples);
    this._pitchRange = [Number.MAX_SAFE_INTEGER, 0];
    fillArrayWithTones(
      tones,
      synth,
      sampleRate,
      this._soundBuffer,
      this._volumeBuffer,
      this._pitchBuffer,
      this._pitchRange
    );
  }
}
