import { Options, Sound, webaudio } from "@pixi/sound";
import { fillArrayWithTones, Tone } from "../../../../../../spark-engine";

export class ToneSound extends Sound {
  protected _tones: Tone[];

  public get tones(): readonly Tone[] {
    return this._tones;
  }

  constructor(tones?: Tone[], options?: Options) {
    super(new webaudio.WebAudioMedia(), {
      autoPlay: false,
      singleInstance: true,
      url: null,
      source: null,
      preload: false,
      volume: 1,
      speed: 1,
      complete: null,
      loaded: null,
      loop: false,
      ...options,
    });

    if (tones) {
      this.loadTones(tones);
    }
  }

  loadTones(tones: Tone[]): void {
    this._tones = tones;
    const duration =
      tones?.length > 0
        ? Math.max(...tones.map((t) => (t?.time || 0) + (t?.duration || 0)))
        : 0;
    const audioContext = this.context.audioContext;
    const sampleRate = this.context.audioContext.sampleRate;
    const durationInSamples = Math.max(1, sampleRate * duration);
    const media = this.media as webaudio.WebAudioMedia;
    const buffer =
      media.buffer ||
      audioContext.createBuffer(1, durationInSamples, sampleRate);
    const fArray = buffer.getChannelData(0);
    fillArrayWithTones(fArray, sampleRate, tones);
    buffer.copyToChannel(fArray, 0);
    if (!this.isLoaded) {
      media.buffer = buffer;
      this.isLoaded = true;
    }
  }
}
