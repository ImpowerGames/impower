import { Event, Object3D } from "three";
import { SparkDOMAudioPlayer } from "../../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import { SynthBuffer } from "../../../../spark-engine/src";
import { Sound } from "../../../../spark-engine/src/game/sound/types/Sound";
import Application from "../Application";
import { Disposable } from "../Disposable";
import Scene from "../Scene";

export default class SoundScene extends Scene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _audioPlayers = new Map<string, SparkDOMAudioPlayer>();

  constructor(app: Application) {
    super(app);
    this.context.game.sound.setAudioContext(this._audioContext);
  }

  override start() {}

  override async load(): Promise<Object3D<Event>[]> {
    // TODO: Load audio ahead of time
    // const audioAssets = this.context.game.struct.config.typeMap["audio"];
    // if (audioAssets) {
    //   await Promise.all(
    //     Object.entries(audioAssets).map(async ([name, asset]) => {
    //       try {
    //         if (asset.src) {
    //           if (asset.ext === "midi" || asset.ext === "mid") {
    //             await this.loadMidi(name, asset.src);
    //           } else {
    //             await this.loadSound(name, asset.src);
    //           }
    //         }
    //       } catch {
    //         console.error("Could not load: ", name);
    //       }
    //     })
    //   );
    // }
    return super.load();
  }

  override bind(): void {
    super.bind();
    this.context?.game?.sound?.events?.onLoad?.addListener((sound) =>
      this.loadSound(sound)
    );
    this.context?.game?.sound?.events?.onStart?.addListener(
      (sounds, after, over) => this.startSounds(sounds, after, over)
    );
    this.context?.game?.sound?.events.onStop?.addListener(
      (sounds, after, over, scheduled) =>
        this.stopSounds(sounds, after, over, scheduled)
    );
    this.context?.game?.sound?.events?.onFade?.addListener(
      (sounds, after, over, scheduled) =>
        this.fadeSounds(sounds, after, over, scheduled)
    );
  }

  override unbind(): void {
    super.unbind();
    this.context?.game?.sound?.events?.onLoad?.removeAllListeners();
    this.context?.game?.sound?.events?.onStart?.removeAllListeners();
    this.context?.game?.sound?.events?.onStop?.removeAllListeners();
    this.context?.game?.sound?.events?.onFade?.removeAllListeners();
  }

  override dispose(): Disposable[] {
    this._audioPlayers.forEach((a) => {
      if (a.started) {
        a.stop(0);
      }
    });
    this._audioPlayers.clear();
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

  async loadSound(sound: Sound) {
    if (this._audioPlayers.get(sound.id)) {
      return this._audioPlayers.get(sound.id)!;
    }
    const buffer = await this.getAudioBuffer(sound.src);
    if (this._audioPlayers.get(sound.id)) {
      return this._audioPlayers.get(sound.id)!;
    }
    const audioPlayer = new SparkDOMAudioPlayer(buffer, this._audioContext, {
      cues: sound.cues,
      loop: sound.loop,
      volume: sound.volume,
    });
    this._audioPlayers.set(sound.id, audioPlayer);
    this.context.game.sound.notifyReady(sound.id);
    return audioPlayer;
  }

  startSounds(sounds: Sound[], after?: number, over?: number) {
    const time = this._audioContext.currentTime + (after ?? 0);
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = time;
        audioPlayer.loop = sound.loop ?? false;
        audioPlayer.volume = sound.volume ?? 1;
        audioPlayer.start(when, over);
      }
    });
  }

  stopSounds(
    sounds: Sound[],
    after?: number,
    over?: number,
    scheduled?: boolean
  ): void {
    const time = this._audioContext.currentTime + (after ?? 0);
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = scheduled ? audioPlayer.getNextCueTime(time) : time;
        audioPlayer.loop = sound.loop ?? false;
        audioPlayer.stop(when, over);
      }
    });
  }

  fadeSounds(
    sounds: Sound[],
    after?: number,
    over?: number,
    scheduled?: boolean
  ): void {
    const time = this._audioContext.currentTime + (after ?? 0);
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = scheduled ? audioPlayer.getNextCueTime(time) : time;
        const volume = sound.volume ?? 1;
        audioPlayer.loop = sound.loop ?? false;
        audioPlayer.fadeVolume(when, volume, over);
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
