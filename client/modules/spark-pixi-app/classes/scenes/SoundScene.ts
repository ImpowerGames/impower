import { Tone } from "../../../../../spark-engine";
import { Graphics } from "../../plugins/graphics";
import { IMediaInstance, SynthSound, WebAudioMedia } from "../../plugins/sound";
import { SparkScene } from "../SparkScene";

interface Instrument {
  sound?: SynthSound;
  shouldPlay?: boolean;
}

export class SoundScene extends SparkScene {
  _instruments: Map<string, Instrument> = new Map();

  axisGraphic?: Graphics;

  waveGraphic?: Graphics;

  pitchGraphic?: Graphics;

  playheadGraphic?: Graphics;

  playListeners?: (() => void)[] = [];

  override init(): void {
    this.axisGraphic = new Graphics();
    this.waveGraphic = new Graphics();
    this.pitchGraphic = new Graphics();
    this.playheadGraphic = new Graphics();
    this.stage.addChild(
      this.axisGraphic,
      this.waveGraphic,
      this.pitchGraphic,
      this.playheadGraphic
    );
  }

  override start(): void {
    this.context?.game?.synth?.events.onStop?.addListener((data) =>
      this.stopInstrument(data)
    );
    this.context?.game?.synth?.events?.onPlay?.addListener((data) =>
      this.playInstrument(data)
    );
  }

  override destroy(): void {
    this.context?.game?.synth?.events?.onConfigure?.removeAllListeners();
    this.context?.game?.synth?.events?.onStop?.removeAllListeners();
    this.context?.game?.synth?.events?.onPlay?.removeAllListeners();
    this._instruments.forEach((instrument) => {
      instrument.sound.stop();
    });
  }

  stopInstrument(data: { instrumentId: string; duration?: number }): void {
    const instrument = this._instruments.get(data.instrumentId);
    const media = instrument?.sound?.media as WebAudioMedia;
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
    const sound = new SynthSound(data.tones);
    instrument.sound = sound;
    instrument.shouldPlay = true;
    if (data.onStart) {
      this.playListeners.push(data.onStart);
    }
    this._instruments.set(data.instrumentId, instrument);
  }

  renderWaveform(instrument: Instrument): void {
    const factor = 0.25;
    const width = this.renderer.width;
    const height = this.renderer.height * factor;

    const endX = width;
    const startX = 0;
    const startY = height;

    const soundBuffer = instrument.sound.track.soundBuffer;
    const pitchBuffer = instrument.sound.track.pitchBuffer;
    const minPitch = instrument.sound.track.pitchRange[0];
    const maxPitch = instrument.sound.track.pitchRange[1];

    const waveStartY = startY + soundBuffer[0];

    this.axisGraphic.clear();
    this.axisGraphic.lineStyle(1, 0xff0000);
    this.axisGraphic.moveTo(startX, waveStartY);
    this.axisGraphic.lineTo(endX, waveStartY);

    this.waveGraphic.clear();
    this.waveGraphic.lineStyle(1, 0xffffff);
    this.waveGraphic.moveTo(startX, waveStartY);
    if (soundBuffer) {
      for (let x = startX; x < endX; x += 1) {
        const timeProgress = (x - startX) / (endX - 1);
        const bufferIndex = Math.floor(timeProgress * (soundBuffer.length - 1));
        const val = soundBuffer[bufferIndex];
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
          const mag =
            maxPitch === minPitch
              ? 0.5
              : (val - minPitch) / (maxPitch - minPitch);
          const delta = mag * (height / 2);
          const y = waveStartY - delta;
          this.pitchGraphic.lineTo(x, y);
        }
      }
    }

    this.playheadGraphic.clear();
    this.playheadGraphic
      .beginFill(0xff0000)
      .drawRect(0, 0, 1, this.renderer.height);
  }

  override update(_time: number, _delta: number): void {
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
              this.playheadGraphic.x = this.screen.width * progress;
            }
          });
        }
      }
    });
  }
}
