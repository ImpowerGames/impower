import { IMediaInstance, utils, webaudio } from "@pixi/sound";
import * as PIXI from "pixi.js";
import { convertNoteToHertz, Tone } from "../../../../../spark-engine";
import { ToneSound } from "../../plugins/midi-sound/classes/ToneSound";
import { SparkScene } from "../SparkScene";

interface Instrument {
  sound?: ToneSound;
  shouldPlay?: boolean;
}

export class SoundScene extends SparkScene {
  _instruments: Map<string, Instrument> = new Map();

  waveformSprite?: PIXI.Sprite;

  pitchGraphic?: PIXI.Graphics;

  playheadGraphic?: PIXI.Graphics;

  override init(): void {
    this.waveformSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
    this.pitchGraphic = new PIXI.Graphics();
    this.playheadGraphic = new PIXI.Graphics();
    this.app.stage.addChild(
      this.waveformSprite,
      this.pitchGraphic,
      this.playheadGraphic
    );
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
    const factor = 0.25;
    const width = this.app.renderer.width;
    const height = this.app.renderer.height * factor;
    const texture = utils.render(instrument.sound, {
      width,
      height,
      fill: "#999",
    });
    this.waveformSprite.texture = new PIXI.Texture(texture);

    const endX = width;
    const startX = 0;
    const startY = height;

    this.pitchGraphic.clear();
    this.pitchGraphic.lineStyle(2, 0x0000ff);
    const tones = instrument.sound.tones;
    const sampleRate = instrument.sound.context.audioContext.sampleRate;
    const durationInSamples = Math.max(
      1,
      sampleRate * instrument.sound.duration
    );
    const buffer = new Float32Array(durationInSamples);
    tones.forEach((tone) => {
      const time = tone.time || 0;
      const duration = tone.duration || 0;
      const timeInSamples = Math.floor(time * sampleRate);
      const durationInSamples = Math.floor(duration * sampleRate);
      const startIndex = timeInSamples;
      const endIndex = timeInSamples + durationInSamples;
      const wave = tone.waves[0];
      const note = wave.note || "";
      const hertz = convertNoteToHertz(note);
      for (let i = startIndex; i < endIndex; i += 1) {
        buffer[i] = hertz;
      }
    });
    this.pitchGraphic.moveTo(startX, startY + buffer[0] * -factor);
    for (let x = startX; x < endX; x += 1) {
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.floor(timeProgress * (buffer.length - 1));
      const hertz = buffer[bufferIndex];
      const delta = hertz * -factor;
      const y = startY + delta;
      if (hertz !== 0) {
        this.pitchGraphic.lineTo(x, y);
      }
    }

    this.playheadGraphic.clear();
    this.playheadGraphic
      .beginFill(0xff0000)
      .drawRect(0, 0, 1, this.app.renderer.height);
  }

  override update(_timeMS: number, _deltaMS: number): void {
    this._instruments.forEach((instrument) => {
      if (instrument.shouldPlay) {
        instrument.shouldPlay = false;
        const instance = instrument.sound.play() as IMediaInstance;
        if (this.context.game.debug.state.debugging) {
          this.renderWaveform(instrument);
          instance.on("progress", (progress) => {
            if (this.playheadGraphic && this.waveformSprite) {
              this.playheadGraphic.x =
                this.waveformSprite.texture.width * progress;
            }
          });
        }
      }
    });
  }
}
