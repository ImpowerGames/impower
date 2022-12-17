import { Tone } from "../types/Tone";
import { fillArrayWithTones } from "../utils/fillArrayWithTones";

export class SynthTrack {
  protected _tones: Tone[];

  public get tones(): readonly Tone[] {
    return this._tones;
  }

  protected _soundBuffer: Float32Array;

  public get soundBuffer(): Float32Array {
    return this._soundBuffer;
  }

  protected _pitchBuffer: Float32Array;

  public get pitchBuffer(): Float32Array {
    return this._pitchBuffer;
  }

  protected _minPitch: number;

  public get minPitch(): number {
    return this._minPitch;
  }

  protected _maxPitch: number;

  public get maxPitch(): number {
    return this._maxPitch;
  }

  protected _durationInSamples: number;

  public get durationInSamples(): number {
    return this._durationInSamples;
  }

  constructor(tones: Tone[], sampleRate: number) {
    this._tones = tones;
    const duration =
      tones?.length > 0
        ? Math.max(...tones.map((t) => (t?.time || 0) + (t?.duration || 0)))
        : 0;
    this._durationInSamples = Math.max(1, sampleRate * duration);
    this._soundBuffer = new Float32Array(this._durationInSamples);
    this._pitchBuffer = new Float32Array(this._durationInSamples);
    const { minPitch, maxPitch } = fillArrayWithTones(
      tones,
      sampleRate,
      this._soundBuffer,
      this._pitchBuffer
    );
    this._minPitch = minPitch;
    this._maxPitch = maxPitch;
  }
}
