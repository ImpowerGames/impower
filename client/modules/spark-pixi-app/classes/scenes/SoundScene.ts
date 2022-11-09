import { IMediaInstance, Sound, utils, webaudio } from "@pixi/sound";
import * as PIXI from "pixi.js";
import {
  fillArrayWithTones,
  InstrumentOptions,
  SAMPLE_RATE,
} from "../../../../../spark-engine";
import { SparkScene } from "../SparkScene";

interface Instrument {
  sound?: Sound;
  played?: boolean;
  sprite?: PIXI.Sprite;
  playhead?: PIXI.Graphics;
}

export class SoundScene extends SparkScene {
  _instruments: Map<string, Instrument> = new Map();

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
    options?: InstrumentOptions
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
    fillArrayWithTones(fArray, tones, options?.envelope, options?.oscillator);

    // set the buffer
    media.buffer = buffer;
    media.nodes.bufferSource.detune.value = options?.detune || 0;
    sound.volume = options?.volume || 1;
    sound.isLoaded = true;

    return sound;
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
      this.context.game.synth.config.instruments[data.instrumentId] || {};
    const instrumentState =
      this.context.game.synth.state.instrumentStates[data.instrumentId] || {};
    const sound = this.createSound(data.tones, {
      ...instrumentConfig,
      ...instrumentState,
    });
    instrument.sound = sound;
    instrument.played = false;
    this._instruments.set(data.instrumentId, instrument);
  }

  renderWaveform(instrument: Instrument, heightFactor = 0.25): void {
    const height = this.app.renderer.height * heightFactor;
    const texture = utils.render(instrument.sound, {
      width: this.app.renderer.width,
      height,
      fill: "#999",
    });
    instrument.playhead = new PIXI.Graphics()
      .beginFill(0xff0000)
      .drawRect(0, 0, 1, height);
    instrument.sprite = new PIXI.Sprite(new PIXI.Texture(texture));
    this.app.stage.addChild(instrument.sprite, instrument.playhead);
  }

  override update(_timeMS: number, _deltaMS: number): void {
    this._instruments.forEach((instrument) => {
      if (!instrument.played) {
        instrument.played = true;
        const instance = instrument.sound.play() as IMediaInstance;
        if (this.context.game.debug.state.debugging) {
          this.renderWaveform(instrument);
          instance.on("progress", (progress) => {
            if (instrument.playhead && instrument.sprite) {
              instrument.playhead.x =
                instrument.sprite.texture.width * progress;
            }
          });
        }
      }
    });
  }
}
