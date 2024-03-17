import { SparkDOMAudioPlayer } from "../../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import { RequestMessage } from "../../../../spark-engine/src/game/core";
import { SynthBuffer } from "../../../../spark-engine/src/game/modules/audio/classes/SynthBuffer";
import { AudioLoadMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/AudioLoadMessage";
import { AudioUpdateMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/AudioUpdateMessage";
import { AudioData } from "../../../../spark-engine/src/game/modules/audio/types/AudioData";
import { AudioUpdate } from "../../../../spark-engine/src/game/modules/audio/types/AudioUpdate";
import { Disposable } from "../Disposable";
import Scene from "../Scene";

export default class AudioScene extends Scene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _audioPlayers = new Map<string, SparkDOMAudioPlayer>();

  override onDispose(): Disposable[] {
    this._audioPlayers.forEach((a) => {
      if (a.started) {
        a.stop(0);
      }
    });
    this._audioPlayers.clear();
    return super.onDispose();
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
      return this._audioPlayers.get(data.id)!;
    }
    const buffer = await this.getAudioBuffer(data);
    if (this._audioPlayers.get(data.id)) {
      return this._audioPlayers.get(data.id)!;
    }
    const audioPlayer = new SparkDOMAudioPlayer(buffer, this._audioContext, {
      volume: data.volume,
      cues: data.cues,
      loop: data.loop,
    });
    this._audioPlayers.set(data.id, audioPlayer);
    return audioPlayer;
  }

  onAudioUpdate(updates: AudioUpdate[]) {
    const now = this._audioContext.currentTime;
    updates.forEach((update) => {
      const audioPlayer = this._audioPlayers.get(update.id);
      if (audioPlayer) {
        const updateTime = now + (update.after ?? 0);
        const when = update.now
          ? updateTime
          : audioPlayer.getNextCueTime(updateTime);
        const over = update.over;
        if (update.loop != null) {
          audioPlayer.loop = update.loop;
        }
        if (update.gain != null) {
          audioPlayer.gain = update.gain * (update.level ?? 1);
        }
        if (update.control === "fade") {
          audioPlayer.fade(when, over);
        }
        if (update.control === "play") {
          audioPlayer.play(when, over);
        }
        if (update.control === "stop") {
          audioPlayer.stop(when, over);
        }
      }
    });
  }

  override onStep(deltaMS: number): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioPlayers.forEach((audioPlayer) => {
      if (audioPlayer.started) {
        audioPlayer.step(scheduledTime, deltaMS);
      }
    });
  }

  override onPause(): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioPlayers.forEach((audioPlayer) => {
      if (audioPlayer.started) {
        audioPlayer.pause(scheduledTime);
      }
    });
  }

  override onUnpause(): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioPlayers.forEach((audioPlayer) => {
      if (audioPlayer.started) {
        audioPlayer.unpause(scheduledTime);
      }
    });
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (AudioLoadMessage.type.isRequest(msg)) {
      await this.onAudioLoad(msg.params);
      return AudioLoadMessage.type.result(msg.params.id);
    }
    if (AudioUpdateMessage.type.isRequest(msg)) {
      await this.onAudioUpdate(msg.params);
      return AudioUpdateMessage.type.result(msg.params.map((u) => u.id));
    }
    return undefined;
  }
}
