import { Options, Sound, webaudio } from "@pixi/sound";
import { SynthTrack, Tone } from "../../../../../../spark-engine";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ToneSoundOptions extends Options {}

export class SynthSound extends Sound {
  protected _track: SynthTrack;

  public get track(): SynthTrack {
    return this._track;
  }

  constructor(tones?: Tone[], options?: ToneSoundOptions) {
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
    const audioContext = this.context.audioContext;
    const sampleRate = this.context.audioContext.sampleRate;
    this._track = new SynthTrack(tones, sampleRate);
    const media = this.media as webaudio.WebAudioMedia;
    const buffer =
      media.buffer ||
      audioContext.createBuffer(1, this._track.durationInSamples, sampleRate);
    buffer.copyToChannel(this._track.soundBuffer, 0);
    if (!this.isLoaded) {
      media.buffer = buffer;
      this.isLoaded = true;
    }
  }
}
