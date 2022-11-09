import { IMediaInstance, Sound, utils, webaudio } from "@pixi/sound";
import * as PIXI from "pixi.js";
import {
  EnvelopeOptions,
  fillArrayWithTones,
  SAMPLE_RATE,
} from "../../../../../spark-engine";
import { SparkScene } from "../SparkScene";

export class SoundScene extends SparkScene {
  _instruments: Map<string, { sound?: Sound; played?: boolean }> = new Map();

  _waveformTexture: PIXI.BaseTexture;

  _playheadGraphic: PIXI.Graphics;

  override start(): void {
    this.context?.game?.synth?.events.onStopInstrument?.addListener((data) =>
      this.stopInstrument(data)
    );
    this.context?.game?.synth?.events?.onPlayInstrument?.addListener((data) =>
      this.playInstrument(data)
    );
  }

  override destroy(): void {
    this.context?.game?.synth?.events?.onConfigureInstrument?.removeAllListeners();
    this.context?.game?.synth?.events?.onStopInstrument?.removeAllListeners();
    this.context?.game?.synth?.events?.onPlayInstrument?.removeAllListeners();
  }

  createSound(
    tones: {
      pitch?: string;
      offset?: number;
      duration?: number;
    }[],
    envelope?: EnvelopeOptions
  ): Sound {
    const sound = Sound.from({});
    if (!(sound.media instanceof webaudio.WebAudioMedia)) {
      return sound;
    }
    const media = sound.media as webaudio.WebAudioMedia;
    const context = sound.context as webaudio.WebAudioContext;

    const numberOfChannels = 1;
    const duration = Math.max(
      ...tones.map((t) => (t.offset || 0) + (t.duration || 0))
    );
    const length = SAMPLE_RATE * duration;

    // create the buffer
    const buffer = context.audioContext.createBuffer(
      numberOfChannels,
      length,
      SAMPLE_RATE
    );
    const fArray = buffer.getChannelData(0);
    fillArrayWithTones(fArray, tones, envelope);

    // set the buffer
    media.buffer = buffer;
    sound.isLoaded = true;

    return sound;
  }

  renderWaveform(sound: Sound): void {
    this._waveformTexture = utils.render(sound, {
      width: this.app.renderer.width,
      height: this.app.renderer.height / 3,
      fill: "#999",
    });
    this._playheadGraphic = new PIXI.Graphics()
      .beginFill(0xff0000)
      .drawRect(0, 0, 1, this.app.renderer.height);
    const sprite = new PIXI.Sprite(new PIXI.Texture(this._waveformTexture));
    this.app.stage.addChild(sprite, this._playheadGraphic);
  }

  stopInstrument(data: { instrumentId: string }): void {
    const instrument = this._instruments.get(data.instrumentId);
    instrument.sound.stop();
  }

  playInstrument(data: {
    instrumentId: string;
    tones: {
      pitch?: string;
      offset?: number;
      duration?: number;
    }[];
  }): void {
    const instrument = this._instruments.get(data.instrumentId) || {};
    instrument?.sound?.stop();
    const instrumentConfig =
      this.context.game.synth.config.instruments[data.instrumentId];
    const instrumentState =
      this.context.game.synth.state.instrumentStates[data.instrumentId];
    const sound = this.createSound(data.tones, instrumentConfig?.envelope);
    sound.volume = instrumentState?.volume || 1;
    instrument.sound = sound;
    instrument.played = false;
    this._instruments.set(data.instrumentId, instrument);
    this.renderWaveform(sound);
  }

  override update(_timeMS: number, _deltaMS: number): void {
    this._instruments.forEach((instrument) => {
      if (!instrument.played) {
        instrument.played = true;
        const instance = instrument.sound.play() as IMediaInstance;
        instance.on("progress", (progress) => {
          this._playheadGraphic.x = this._waveformTexture.width * progress;
        });
      }
    });
  }
}
