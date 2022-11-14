import { IMediaInstance, utils, webaudio } from "@pixi/sound";
import * as PIXI from "pixi.js";
import { Tone } from "../../../../../spark-engine";
import { ToneSound } from "../../plugins/midi-sound/classes/ToneSound";
import { SparkScene } from "../SparkScene";

interface Instrument {
  sound?: ToneSound;
  shouldPlay?: boolean;
}

export class SoundScene extends SparkScene {
  _instruments: Map<string, Instrument> = new Map();

  waveform?: PIXI.Sprite;

  playhead?: PIXI.Graphics;

  override init(): void {
    this.waveform = new PIXI.Sprite(PIXI.Texture.EMPTY);
    this.playhead = new PIXI.Graphics();
    this.app.stage.addChild(this.waveform, this.playhead);
  }

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
    this._instruments.forEach((instrument) => {
      instrument.sound.stop();
    });
  }

  stopInstrument(data: { instrumentId: string; duration?: number }): void {
    const instrument = this._instruments.get(data.instrumentId);
    const media = instrument?.sound?.media as webaudio.WebAudioMedia;
    if (media) {
      const endTime =
        instrument.sound.context.audioContext.currentTime +
        (data?.duration || 0);
      media.nodes.gain.gain.linearRampToValueAtTime(0, endTime);
    }
  }

  playInstrument(data: { instrumentId: string; tones: Tone[] }): void {
    const instrument = this._instruments.get(data.instrumentId) || {};
    const sound = new ToneSound(data.tones);
    instrument.sound = sound;
    instrument.shouldPlay = true;
    this._instruments.set(data.instrumentId, instrument);
  }

  renderWaveform(instrument: Instrument): void {
    const height = this.app.renderer.height * 0.25;
    const texture = utils.render(instrument.sound, {
      width: this.app.renderer.width,
      height,
      fill: "#999",
    });
    this.waveform.texture = new PIXI.Texture(texture);
    this.playhead.clear();
    this.playhead.beginFill(0xff0000).drawRect(0, 0, 1, height);
  }

  override update(_timeMS: number, _deltaMS: number): void {
    this._instruments.forEach((instrument) => {
      if (instrument.shouldPlay) {
        instrument.shouldPlay = false;
        const instance = instrument.sound.play() as IMediaInstance;
        if (this.context.game.debug.state.debugging) {
          this.renderWaveform(instrument);
          instance.on("progress", (progress) => {
            if (this.playhead && this.waveform) {
              this.playhead.x = this.waveform.texture.width * progress;
            }
          });
        }
      }
    });
  }
}
