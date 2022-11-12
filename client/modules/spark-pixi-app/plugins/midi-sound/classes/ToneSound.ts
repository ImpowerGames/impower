import { Options, Sound, webaudio } from "@pixi/sound";
import { fillArrayWithTones, Tone } from "../../../../../../spark-engine";

export class ToneSound extends Sound {
  constructor(tones: Tone[], options?: Options) {
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

    const duration = Math.max(
      ...tones.map((t) => (t?.time || 0) + (t?.duration || 0))
    );

    // create the buffer
    const audioContext = this.context.audioContext;
    const sampleRate = this.context.audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const fArray = buffer.getChannelData(0);
    fillArrayWithTones(fArray, sampleRate, tones);

    // set the buffer
    const media = this.media as webaudio.WebAudioMedia;
    media.buffer = buffer;
    this.isLoaded = true;
  }
}
