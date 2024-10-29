import AudioMixer from "../../../../spark-dom/src/classes/AudioMixer";
import AudioPlayer from "../../../../spark-dom/src/classes/AudioPlayer";
import { RequestMessage } from "../../../../spark-engine/src/game/core";
import { SynthBuffer } from "../../../../spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { LoadAudioMixerMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/LoadAudioMixerMessage";
import { LoadAudioPlayerMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/LoadAudioPlayerMessage";
import { UpdateAudioPlayersMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/UpdateAudioPlayersMessage";
import { LoadAudioMixerParams } from "../../../../spark-engine/src/game/modules/audio/types/LoadAudioMixerParams";
import { LoadAudioPlayerParams } from "../../../../spark-engine/src/game/modules/audio/types/LoadAudioPlayerParams";
import { UpdateAudioPlayersParams } from "../../../../spark-engine/src/game/modules/audio/types/UpdateAudioPlayersParams";
import { Disposable } from "../Disposable";
import Scene from "../Scene";

export default class AudioScene extends Scene {
  protected _audioContext: AudioContext = new AudioContext();

  protected _audioBuffers = new Map<string, AudioBuffer>();

  protected _audioMixers = new Map<string, AudioMixer>();

  protected _audioChannels = new Map<string, Map<string, AudioPlayer>>();

  override onDispose(): Disposable[] {
    this._audioMixers.clear();
    this._audioBuffers.clear();
    this._audioChannels.forEach((c) => {
      c.forEach((p) => {
        p.dispose();
      });
    });
    this._audioChannels.clear();
    return super.onDispose();
  }

  async loadAudioBuffer(params: LoadAudioPlayerParams): Promise<AudioBuffer> {
    if (params.src) {
      const response = await fetch(params.src);
      const buffer = await response.arrayBuffer();
      const audioBuffer = await this._audioContext.decodeAudioData(buffer);
      return audioBuffer;
    }
    if (params.synth && params.tones) {
      const synthBuffer = new SynthBuffer(
        params.synth,
        params.tones,
        this._audioContext.sampleRate
      );
      const audioBuffer = this._audioContext.createBuffer(
        1,
        synthBuffer.soundBuffer.length,
        this._audioContext.sampleRate
      );
      audioBuffer.copyToChannel(synthBuffer.soundBuffer, 0);
      return audioBuffer;
    }
    return this._audioContext.createBuffer(1, 1, this._audioContext.sampleRate);
  }

  async getAudioBuffer(params: LoadAudioPlayerParams): Promise<AudioBuffer> {
    const existingAudioBuffer = this._audioBuffers.get(params.key);
    if (existingAudioBuffer) {
      return existingAudioBuffer;
    }
    const audioBuffer = await this.loadAudioBuffer(params);
    this._audioBuffers.set(params.key, audioBuffer);
    return audioBuffer;
  }

  getAudioMixer(mixer = "main", volume?: number): AudioMixer {
    const existingAudioMixer = this._audioMixers.get(mixer);
    if (existingAudioMixer) {
      return existingAudioMixer;
    }
    const audioMixer = new AudioMixer(this._audioContext, volume);
    this._audioMixers.set(mixer, audioMixer);
    return audioMixer;
  }

  getAudioChannel(channel = "main"): Map<string, AudioPlayer> {
    const existingAudioChannel = this._audioChannels.get(channel);
    if (existingAudioChannel) {
      return existingAudioChannel;
    }
    const audioChannel = new Map();
    this._audioChannels.set(channel, audioChannel);
    return audioChannel;
  }

  destroyAudio(key: string, channel: string | undefined) {
    const audioChannel = this._audioChannels.get(channel || "main");
    if (audioChannel) {
      const audioPlayer = audioChannel.get(key);
      if (audioPlayer) {
        audioPlayer.dispose();
      }
      audioChannel.delete(key);
    }
    this._audioBuffers.delete(key);
  }

  async getAudioPlayer(params: LoadAudioPlayerParams): Promise<AudioPlayer> {
    const audioChannel = this.getAudioChannel(params.channel);
    if (audioChannel.get(params.key)) {
      return audioChannel.get(params.key)!;
    }
    const audioBuffer = await this.getAudioBuffer(params);
    if (audioChannel.get(params.key)) {
      return audioChannel.get(params.key)!;
    }
    const audioMixer = this.getAudioMixer(params.mixer);
    const audioPlayer = new AudioPlayer(audioBuffer, this._audioContext, {
      volume: params.volume,
      cues: params.cues,
      loop: params.loop,
      destination: audioMixer?.volumeNode,
    });
    audioChannel.set(params.key, audioPlayer);
    return audioPlayer;
  }

  async onLoadAudioMixer(params: LoadAudioMixerParams) {
    return this.getAudioMixer(params.key, params.volume);
  }

  async onLoadAudioPlayer(params: LoadAudioPlayerParams) {
    return this.getAudioPlayer(params);
  }

  async onUpdateAudioPlayers(params: UpdateAudioPlayersParams) {
    const now = this._audioContext.currentTime;
    params.updates.forEach((update) => {
      const audioChannel = this.getAudioChannel(update.channel);
      const audioPlayer = audioChannel.get(update.key);
      if (audioPlayer) {
        const updateTime = now + (update.after ?? 0);
        const when = update.now
          ? updateTime
          : audioPlayer.getNextCueTime(updateTime);
        const over = update.over;
        if (update.loop != null) {
          audioPlayer.loop = update.loop;
        }
        if (update.control === "modulate") {
          audioPlayer.fade(when, over, update.fadeto);
        }
        if (update.control === "start") {
          audioPlayer.start(when, over, undefined, undefined, update.fadeto);
        }
        if (update.control === "stop") {
          audioPlayer.stop(when, over);
        }
      }
    });
  }

  override onStep(deltaMS: number): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioChannels.forEach((c) => {
      c.forEach((p) => {
        p.step(scheduledTime, deltaMS);
      });
    });
  }

  override onPause(): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioChannels.forEach((c) => {
      c.forEach((p) => {
        p.pause(scheduledTime);
      });
    });
  }

  override onUnpause(): void {
    const scheduledTime = this._audioContext.currentTime;
    this._audioChannels.forEach((c) => {
      c.forEach((p) => {
        p.unpause(scheduledTime);
      });
    });
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (LoadAudioMixerMessage.type.isRequest(msg)) {
      await this.onLoadAudioMixer(msg.params);
      return LoadAudioMixerMessage.type.result(msg.params);
    }
    if (LoadAudioPlayerMessage.type.isRequest(msg)) {
      await this.onLoadAudioPlayer(msg.params);
      const outputLatency =
        window.AudioContext && "outputLatency" in window.AudioContext.prototype
          ? this._audioContext.outputLatency
          : 0;
      return LoadAudioPlayerMessage.type.result({
        ...msg.params,
        outputLatency,
      });
    }
    if (UpdateAudioPlayersMessage.type.isRequest(msg)) {
      await this.onUpdateAudioPlayers(msg.params);
      return UpdateAudioPlayersMessage.type.result(msg.params);
    }
    return undefined;
  }
}
