import { SparkDOMSynth } from "../../../../../spark-dom";
import { Graphics } from "../../plugins/graphics";
import { SparkScene } from "../SparkScene";

export class SoundScene extends SparkScene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _instruments: Map<string, SparkDOMSynth> = new Map();

  protected _axisGraphic?: Graphics;

  protected _waveGraphic?: Graphics;

  protected _playheadGraphic?: Graphics;

  override init(): void {
    this._axisGraphic = new Graphics();
    this._waveGraphic = new Graphics();
    this._playheadGraphic = new Graphics();
    this.stage.addChild(
      this._axisGraphic,
      this._waveGraphic,
      this._playheadGraphic
    );
    this.context.game.sound.config.sampleRate = this._audioContext.sampleRate;
    this.context.game.sound.config.synths =
      this.context.game.struct.config.objectMap?.synth || {};
  }

  override bind(): void {
    super.bind();
    this.context?.game?.sound?.events?.onStarted?.addListener((id, buffer) =>
      this.start(id, buffer)
    );
    this.context?.game?.sound?.events?.onPaused?.addListener((id) =>
      this.pause(id)
    );
    this.context?.game?.sound?.events?.onUnpaused?.addListener((id) =>
      this.unpause(id)
    );
    this.context?.game?.sound?.events.onStopped?.addListener((id) =>
      this.stop(id)
    );
  }

  override unbind(): void {
    super.unbind();
    this.context?.game?.sound?.events?.onStarted?.removeAllListeners();
    this.context?.game?.sound?.events?.onPaused?.removeAllListeners();
    this.context?.game?.sound?.events?.onUnpaused?.removeAllListeners();
    this.context?.game?.sound?.events?.onStopped?.removeAllListeners();
    this._instruments.forEach((instrument) => {
      instrument.stop();
    });
  }

  start(id: string, buffer: Float32Array): void {
    const instrument = new SparkDOMSynth(buffer, this._audioContext);
    instrument.start();
    this._instruments.set(id, instrument);
  }

  pause(id: string): void {
    const instrument = this._instruments.get(id);
    if (instrument) {
      instrument.pause();
    }
  }

  unpause(id: string): void {
    const instrument = this._instruments.get(id);
    if (instrument) {
      instrument.unpause();
    }
  }

  stop(id: string): void {
    const instrument = this._instruments.get(id);
    if (instrument) {
      instrument.stop();
    }
  }

  override update(deltaMS: number): boolean {
    this.context.game.sound.update(deltaMS);
    Object.entries(this.context.game.sound.state.playbackStates).forEach(
      ([k, v]) => {
        const progress = v.elapsedMS / v.durationMS;
        const instrument = this._instruments.get(k);
        if (this.context.game.debug.state.debugging && instrument.duration) {
          this.renderWaveform(instrument);
          this._playheadGraphic.x = this.screen.width * progress;
        }
      }
    );
    return false;
  }

  renderWaveform(instrument: SparkDOMSynth): void {
    const factor = 0.25;
    const width = this.renderer.width;
    const height = this.renderer.height * factor;

    const endX = width;
    const startX = 0;
    const startY = height;

    const soundBuffer = instrument.soundBuffer;

    const waveStartY = startY + soundBuffer[0];

    this._axisGraphic.clear();
    this._axisGraphic.lineStyle(1, 0xff0000);
    this._axisGraphic.moveTo(startX, waveStartY);
    this._axisGraphic.lineTo(endX, waveStartY);

    this._waveGraphic.clear();
    this._waveGraphic.lineStyle(1, 0xffffff);
    this._waveGraphic.moveTo(startX, waveStartY);
    if (soundBuffer) {
      for (let x = startX; x < endX; x += 1) {
        const timeProgress = (x - startX) / (endX - 1);
        const bufferIndex = Math.floor(timeProgress * (soundBuffer.length - 1));
        const val = soundBuffer[bufferIndex];
        const delta = val * 100;
        const y = waveStartY + delta;
        this._waveGraphic.lineTo(x, y);
      }
    }

    this._playheadGraphic.clear();
    this._playheadGraphic
      .beginFill(0xff0000)
      .drawRect(0, 0, 1, this.renderer.height);
  }
}
