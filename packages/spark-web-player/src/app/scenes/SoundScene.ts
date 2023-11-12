import { Event, Object3D } from "three";
import { SparkDOMAudioPlayer } from "../../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import { SynthBuffer } from "../../../../spark-engine/src";
import { Disposable } from "../Disposable";
import Scene from "../Scene";

export default class SoundScene extends Scene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _audioPlayers: Map<string, SparkDOMAudioPlayer> = new Map();

  override start() {
    this.context.game.sound.config.synths =
      this.context.game.struct.config.typeMap["synth"] || {};
  }

  override async load(): Promise<Object3D<Event>[]> {
    const audioAssets = this.context.game.struct.config.typeMap["audio"];
    if (audioAssets) {
      await Promise.all(
        Object.entries(audioAssets).map(async ([name, asset]) => {
          try {
            if (asset.src) {
              if (asset.ext === "midi" || asset.ext === "mid") {
                await this.loadMidi(name, asset.src);
              } else {
                await this.loadSound(name, asset.src);
              }
            }
          } catch {
            console.error("Could not load: ", name);
          }
        })
      );
    }
    return super.load();
  }

  override bind(): void {
    super.bind();
    this.context?.game?.sound?.events?.onScheduled?.addListener(
      (id, sound, loop) => this.scheduleSound(id, sound, loop)
    );
    this.context?.game?.sound?.events?.onStarted?.addListener((ids) =>
      this.startSounds(ids)
    );
    this.context?.game?.sound?.events?.onPaused?.addListener((ids) =>
      this.pauseSounds(ids)
    );
    this.context?.game?.sound?.events?.onUnpaused?.addListener((ids) =>
      this.unpauseSounds(ids)
    );
    this.context?.game?.sound?.events.onStopped?.addListener((ids) =>
      this.stopSounds(ids)
    );
  }

  override unbind(): void {
    super.unbind();
    this.context?.game?.sound?.events?.onScheduled?.removeAllListeners();
    this.context?.game?.sound?.events?.onStarted?.removeAllListeners();
    this.context?.game?.sound?.events?.onPaused?.removeAllListeners();
    this.context?.game?.sound?.events?.onUnpaused?.removeAllListeners();
    this.context?.game?.sound?.events?.onStopped?.removeAllListeners();
  }

  override dispose(): Disposable[] {
    this._audioPlayers.forEach((a) => {
      if (a.started) {
        a.stop(0);
      }
    });
    return super.dispose();
  }

  async getAudioBuffer(
    sound: Float32Array | SynthBuffer | string
  ): Promise<AudioBuffer | Float32Array | SynthBuffer> {
    if (typeof sound === "string") {
      const response = await fetch(sound);
      const buffer = await response.arrayBuffer();
      const decoded = await this._audioContext.decodeAudioData(buffer);
      return decoded;
    }
    return sound;
  }

  async loadMidi(_id: string, _src: string) {
    // TODO: load midi
  }

  async loadSound(id: string, sound: Float32Array | SynthBuffer | string) {
    if (!this._audioPlayers.get(id)) {
      const buffer = await this.getAudioBuffer(sound);
      const audioPlayer = new SparkDOMAudioPlayer(buffer, this._audioContext);
      this._audioPlayers.set(id, audioPlayer);
      this.context.game.sound.ready(id);
    }
    return this._audioPlayers.get(id)!;
  }

  async scheduleSound(
    id: string,
    sound: Float32Array | SynthBuffer | string,
    loop: boolean
  ) {
    const audioPlayer = await this.loadSound(id, sound);
    audioPlayer.loop = loop;
  }

  startSounds(ids: string[]) {
    const scheduledTime = this._audioContext.currentTime;
    ids.forEach((id) => {
      const audioPlayer = this._audioPlayers.get(id);
      if (audioPlayer) {
        audioPlayer.start(scheduledTime);
      }
    });
  }

  pauseSounds(ids: string[]): void {
    const scheduledTime = this._audioContext.currentTime;
    ids.forEach((id) => {
      const audioPlayer = this._audioPlayers.get(id);
      if (audioPlayer) {
        audioPlayer.pause(scheduledTime);
      }
    });
  }

  unpauseSounds(ids: string[]): void {
    const scheduledTime = this._audioContext.currentTime;
    ids.forEach((id) => {
      const audioPlayer = this._audioPlayers.get(id);
      if (audioPlayer) {
        audioPlayer.unpause(scheduledTime);
      }
    });
  }

  stopSounds(ids: string[]): void {
    const scheduledTime = this._audioContext.currentTime;
    ids.forEach((id) => {
      const audioPlayer = this._audioPlayers.get(id);
      if (audioPlayer) {
        audioPlayer.stop(scheduledTime);
      }
    });
  }

  override update(deltaMS: number): boolean {
    this.context.game.sound.update(deltaMS);
    return false;
  }

  override step(deltaMS: number): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioPlayers.forEach((audioPlayer) => {
      if (audioPlayer.started) {
        audioPlayer.step(scheduledTime, deltaMS);
      }
    });
  }

  override pause(): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioPlayers.forEach((audioPlayer) => {
      if (audioPlayer.started) {
        audioPlayer.pause(scheduledTime);
      }
    });
  }

  override unpause(): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioPlayers.forEach((audioPlayer) => {
      if (audioPlayer.started) {
        audioPlayer.unpause(scheduledTime);
      }
    });
  }
}
