import { SparkDOMAudioPlayer } from "../../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import { SynthBuffer } from "../../../../spark-engine/src";
import Scene from "../Scene";

export default class SoundScene extends Scene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _instruments: Map<string, SparkDOMAudioPlayer> = new Map();

  override start() {
    this.context.game.sound.config.sampleRate = this._audioContext.sampleRate;
    this.context.game.sound.config.synths =
      this.context.game.struct.config.objectMap["synth"] || {};
  }

  override bind(): void {
    super.bind();
    this.context?.game?.sound?.events?.onStarted?.addListener((id, sound) =>
      this.startInstrument(id, sound)
    );
    this.context?.game?.sound?.events?.onPaused?.addListener((id) =>
      this.pauseInstrument(id)
    );
    this.context?.game?.sound?.events?.onUnpaused?.addListener((id) =>
      this.unpauseInstrument(id)
    );
    this.context?.game?.sound?.events.onStopped?.addListener((id) =>
      this.stopInstrument(id)
    );
  }

  override unbind(): void {
    super.unbind();
    this.context?.game?.sound?.events?.onStarted?.removeAllListeners();
    this.context?.game?.sound?.events?.onPaused?.removeAllListeners();
    this.context?.game?.sound?.events?.onUnpaused?.removeAllListeners();
    this.context?.game?.sound?.events?.onStopped?.removeAllListeners();
  }

  startInstrument(id: string, sound: Float32Array | SynthBuffer): void {
    const instrument = new SparkDOMAudioPlayer(sound, this._audioContext);
    instrument.start();
    this._instruments.set(id, instrument);
  }

  pauseInstrument(id: string): void {
    const instrument = this._instruments.get(id);
    if (instrument) {
      instrument.pause();
    }
  }

  unpauseInstrument(id: string): void {
    const instrument = this._instruments.get(id);
    if (instrument) {
      instrument.unpause();
    }
  }

  stopInstrument(id: string): void {
    const instrument = this._instruments.get(id);
    if (instrument) {
      instrument.stop();
    }
  }

  override update(deltaMS: number): boolean {
    this.context.game.sound.update(deltaMS);
    return false;
  }

  override step(deltaMS: number): void {
    Object.entries(this.context.game.sound.state.playbackStates).forEach(
      ([k]) => {
        const instrument = this._instruments.get(k);
        if (instrument) {
          instrument.step(deltaMS);
        }
      }
    );
  }

  override pause(): void {
    Object.entries(this.context.game.sound.state.playbackStates).forEach(
      ([k]) => {
        const instrument = this._instruments.get(k);
        if (instrument) {
          instrument.pause();
        }
      }
    );
  }

  override unpause(): void {
    Object.entries(this.context.game.sound.state.playbackStates).forEach(
      ([k]) => {
        const instrument = this._instruments.get(k);
        if (instrument) {
          instrument.unpause();
        }
      }
    );
  }
}