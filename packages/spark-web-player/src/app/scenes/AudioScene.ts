import { Event, Object3D } from "three";
import { SparkDOMAudioPlayer } from "../../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import { SynthBuffer } from "../../../../spark-engine/src/game/modules/audio/classes/SynthBuffer";
import { AudioData } from "../../../../spark-engine/src/game/modules/audio/types/AudioData";
import { AudioUpdate } from "../../../../spark-engine/src/game/modules/audio/types/AudioUpdate";
import { Disposable } from "../Disposable";
import Scene from "../Scene";

export default class AudioScene extends Scene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _audioPlayers = new Map<string, SparkDOMAudioPlayer>();

  override start() {}

  override async load(): Promise<Object3D<Event>[]> {
    // TODO: Check if asset.preload === true (ensure loading screen shows while preloading)
    // const audioAssets = this.game.logic["audio"];
    // if (audioAssets) {
    //   await Promise.all(
    //     Object.entries(audioAssets).map(async ([name, asset]) => {
    //       try {
    //         if (asset.src) {
    //           if (asset.ext === "midi" || asset.ext === "mid") {
    //             await this.loadMidi(name, asset.src);
    //           } else {
    //             await this.loadSound({ id: asset.name, ...asset });
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
    this.game?.audio?.events?.onLoad?.addListener((data) =>
      this.onAudioLoad(data)
    );
    this.game?.audio?.events?.onUpdate?.addListener((updates) =>
      this.onAudioUpdate(updates)
    );
  }

  override unbind(): void {
    super.unbind();
    this.game?.audio?.events?.onLoad?.removeAllListeners();
    this.game?.audio?.events?.onUpdate?.removeAllListeners();
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
    data: AudioData
  ): Promise<AudioBuffer | Float32Array | SynthBuffer> {
    if (data.src) {
      const response = await fetch(data.src);
      const buffer = await response.arrayBuffer();
      const decoded = await this._audioContext.decodeAudioData(buffer);
      return decoded;
    }
    if (data.synth && data.tones) {
      return new SynthBuffer(
        data.synth,
        data.tones,
        this._audioContext.sampleRate
      );
    }
    return new Float32Array();
  }

  async onAudioLoad(data: AudioData) {
    if (this._audioPlayers.get(data.id)) {
      this.game.audio.notifyReady(data.id);
      return this._audioPlayers.get(data.id)!;
    }
    const buffer = await this.getAudioBuffer(data);
    if (this._audioPlayers.get(data.id)) {
      this.game.audio.notifyReady(data.id);
      return this._audioPlayers.get(data.id)!;
    }
    const audioPlayer = new SparkDOMAudioPlayer(buffer, this._audioContext, {
      volume: data.volume,
      cues: data.cues,
    });
    this._audioPlayers.set(data.id, audioPlayer);
    this.game.audio.notifyReady(data.id);
    return audioPlayer;
  }

  onAudioUpdate(updates: AudioUpdate[]) {
    const now = this._audioContext.currentTime;
    updates.forEach((update) => {
      const audioPlayer = this._audioPlayers.get(update.id);
      if (audioPlayer) {
        audioPlayer.loop = update.looping;
        audioPlayer.volume = update.volume;
        const updateTime = now + update.after;
        const when = update.scheduled
          ? audioPlayer.getNextCueTime(updateTime)
          : updateTime;
        const over = update.over;
        if (!update.playing) {
          audioPlayer.stop(when, over);
        } else {
          audioPlayer.play(when, over);
        }
      }
    });
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
