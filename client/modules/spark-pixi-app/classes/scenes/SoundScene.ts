import { IMediaInstance, webaudio } from "@pixi/sound";
import * as PIXI from "pixi.js";
import {
  fillArrayWithPitches,
  fillArrayWithTones,
  Tone,
} from "../../../../../spark-engine";
import { ToneSound } from "../../plugins/midi-sound/classes/ToneSound";
import { SparkScene } from "../SparkScene";

interface Instrument {
  sound?: ToneSound;
  shouldPlay?: boolean;
}

export class SoundScene extends SparkScene {
  _instruments: Map<string, Instrument> = new Map();

  axisGraphic?: PIXI.Graphics;

  waveGraphic?: PIXI.Graphics;

  pitchGraphic?: PIXI.Graphics;

  playheadGraphic?: PIXI.Graphics;

  playListeners?: (() => void)[] = [];

  override init(): void {
    this.axisGraphic = new PIXI.Graphics();
    this.waveGraphic = new PIXI.Graphics();
    this.pitchGraphic = new PIXI.Graphics();
    this.playheadGraphic = new PIXI.Graphics();
    this.app.stage.addChild(
      this.axisGraphic,
      this.waveGraphic,
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

  playInstrument(data: {
    instrumentId: string;
    tones: Tone[];
    onStart?: () => void;
  }): void {
    const instrument = this._instruments.get(data.instrumentId) || {};
    const sound = new ToneSound(data.tones);
    instrument.sound = sound;
    instrument.shouldPlay = true;
    if (data.onStart) {
      this.playListeners.push(data.onStart);
    }
    this._instruments.set(data.instrumentId, instrument);
  }

  renderWaveform(instrument: Instrument): void {
    const factor = 0.25;
    const width = this.app.renderer.width;
    const height = this.app.renderer.height * factor;

    const endX = width;
    const startX = 0;
    const startY = height;

    const tones = instrument.sound.tones;
    const sampleRate = instrument.sound.context.audioContext.sampleRate;
    const waveBuffer = new Float32Array(instrument.sound.durationInSamples);
    const pitchBuffer = new Float32Array(instrument.sound.durationInSamples);
    const waveforms = fillArrayWithTones(waveBuffer, sampleRate, tones);
    const { min, max } = fillArrayWithPitches(pitchBuffer, waveforms);

    const waveStartY = startY + waveBuffer[0];

    this.axisGraphic.clear();
    this.axisGraphic.lineStyle(1, 0xff0000);
    this.axisGraphic.moveTo(startX, waveStartY);
    this.axisGraphic.lineTo(endX, waveStartY);

    this.waveGraphic.clear();
    this.waveGraphic.lineStyle(1, 0xffffff);
    this.waveGraphic.moveTo(startX, waveStartY);
    if (waveBuffer) {
      for (let x = startX; x < endX; x += 1) {
        const timeProgress = (x - startX) / (endX - 1);
        const bufferIndex = Math.floor(timeProgress * (waveBuffer.length - 1));
        const val = waveBuffer[bufferIndex];
        const delta = val * 100;
        const y = waveStartY + delta;
        this.waveGraphic.lineTo(x, y);
      }
    }

    this.pitchGraphic.clear();
    this.pitchGraphic.lineStyle(2, 0x0000ff);
    this.pitchGraphic.moveTo(startX, waveStartY);
    if (pitchBuffer) {
      for (let x = startX; x < endX; x += 1) {
        const timeProgress = (x - startX) / (endX - 1);
        const bufferIndex = Math.floor(timeProgress * (pitchBuffer.length - 1));
        const val = pitchBuffer[bufferIndex];
        if (val === 0) {
          this.pitchGraphic.moveTo(x, waveStartY);
        } else {
          const mag = max === min ? 0.5 : (val - min) / (max - min);
          const delta = mag * (height / 2);
          const y = waveStartY - delta;
          this.pitchGraphic.lineTo(x, y);
        }
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
        if (this.playListeners.length > 0) {
          this.playListeners.forEach((listener) => listener?.());
          this.playListeners = [];
        }
        const instance = instrument.sound.play() as IMediaInstance;
        if (this.context.game.debug.state.debugging) {
          this.renderWaveform(instrument);
          instance.on("progress", (progress) => {
            if (this.playheadGraphic) {
              this.playheadGraphic.x = this.app.screen.width * progress;
            }
          });
        }
      }
    });
  }
}
