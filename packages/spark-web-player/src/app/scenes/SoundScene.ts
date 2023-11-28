import { Event, Object3D } from "three";
import { SparkDOMAudioPlayer } from "../../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import { SynthBuffer } from "../../../../spark-engine/src";
import { Sound } from "../../../../spark-engine/src/game/sound/types/Sound";
import { Disposable } from "../Disposable";
import Scene from "../Scene";

export default class SoundScene extends Scene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _audioPlayers = new Map<string, SparkDOMAudioPlayer>();

  override start() {
    this.context.game.sound.config.synths =
      this.context.game.struct.config.typeMap["Synth"] || {};
  }

  override async load(): Promise<Object3D<Event>[]> {
    // TODO: Load audio ahead of time
    // const audioAssets = this.context.game.struct.config.typeMap["Audio"];
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
    this.context?.game?.sound?.events?.onStart?.addListener((sounds, offset) =>
      this.startSounds(sounds, offset)
    );
    this.context?.game?.sound?.events.onStop?.addListener(
      (sounds, offset, scheduled) => this.stopSounds(sounds, offset, scheduled)
    );
    this.context?.game?.sound?.events?.onPause?.addListener(
      (sounds, offset, scheduled) => this.pauseSounds(sounds, offset, scheduled)
    );
    this.context?.game?.sound?.events?.onUnpause?.addListener(
      (sounds, offset, scheduled) =>
        this.unpauseSounds(sounds, offset, scheduled)
    );
    this.context?.game?.sound?.events?.onMute?.addListener(
      (sounds, offset, scheduled) => this.muteSounds(sounds, offset, scheduled)
    );
    this.context?.game?.sound?.events?.onUnmute?.addListener(
      (sounds, offset, scheduled) =>
        this.unmuteSounds(sounds, offset, scheduled)
    );
  }

  override unbind(): void {
    super.unbind();
    this.context?.game?.sound?.events?.onLoad?.removeAllListeners();
    this.context?.game?.sound?.events?.onStart?.removeAllListeners();
    this.context?.game?.sound?.events?.onStop?.removeAllListeners();
    this.context?.game?.sound?.events?.onPause?.removeAllListeners();
    this.context?.game?.sound?.events?.onUnpause?.removeAllListeners();
    this.context?.game?.sound?.events?.onMute?.removeAllListeners();
    this.context?.game?.sound?.events?.onUnmute?.removeAllListeners();
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
      loop: sound.loop,
      volume: sound.volume,
      muted: sound.muted,
      attack: sound.attack,
      release: sound.release,
      cues: sound.cues,
    });
    this._audioPlayers.set(sound.id, audioPlayer);
    this.context.game.sound.notifyReady(sound.id);
    return audioPlayer;
  }

  startSounds(sounds: Sound[], offset: number) {
    const time = this._audioContext.currentTime + offset;
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = time;
        audioPlayer.start(when);
      }
    });
  }

  stopSounds(sounds: Sound[], offset: number, scheduled: boolean): void {
    const time = this._audioContext.currentTime + offset;
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = scheduled ? audioPlayer.getNextCueTime(time) : time;
        audioPlayer.stop(when);
      }
    });
  }

  pauseSounds(sounds: Sound[], offset: number, scheduled: boolean): void {
    const time = this._audioContext.currentTime + offset;
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = scheduled ? audioPlayer.getNextCueTime(time) : time;
        audioPlayer.pause(when);
      }
    });
  }

  unpauseSounds(sounds: Sound[], offset: number, scheduled: boolean): void {
    const time = this._audioContext.currentTime + offset;
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = scheduled ? audioPlayer.getNextCueTime(time) : time;
        audioPlayer.unpause(when);
      }
    });
  }

  muteSounds(sounds: Sound[], offset: number, scheduled: boolean): void {
    const time = this._audioContext.currentTime + offset;
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = scheduled ? audioPlayer.getNextCueTime(time) : time;
        audioPlayer.mute(when);
      }
    });
  }

  unmuteSounds(sounds: Sound[], offset: number, scheduled: boolean): void {
    const time = this._audioContext.currentTime + offset;
    sounds.forEach((sound) => {
      const audioPlayer = this._audioPlayers.get(sound.id);
      if (audioPlayer) {
        const when = scheduled ? audioPlayer.getNextCueTime(time) : time;
        audioPlayer.unmute(when);
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
