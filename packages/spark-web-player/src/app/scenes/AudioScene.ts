import AudioMixer from "@impower/spark-dom/src/classes/AudioMixer";
import AudioPlayer from "@impower/spark-dom/src/classes/AudioPlayer";
import { RequestMessage } from "@impower/spark-engine/src/game/core";
import { SynthBuffer } from "@impower/spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { ConfigureAudioMixerMessage } from "@impower/spark-engine/src/game/modules/audio/classes/messages/ConfigureAudioMixerMessage";
import { LoadAudioPlayerMessage } from "@impower/spark-engine/src/game/modules/audio/classes/messages/LoadAudioPlayerMessage";
import { UpdateAudioPlayersMessage } from "@impower/spark-engine/src/game/modules/audio/classes/messages/UpdateAudioPlayersMessage";
import { AudioPlayerUpdate } from "@impower/spark-engine/src/game/modules/audio/types/AudioPlayerUpdate";
import { ConfigureAudioMixerParams } from "@impower/spark-engine/src/game/modules/audio/types/ConfigureAudioMixerParams";
import { LoadAudioPlayerParams } from "@impower/spark-engine/src/game/modules/audio/types/LoadAudioPlayerParams";
import { UpdateAudioPlayersParams } from "@impower/spark-engine/src/game/modules/audio/types/UpdateAudioPlayersParams";
import { Disposable } from "../Disposable";
import Scene from "../Scene";

export default class AudioScene extends Scene {
  /**
   * This audio context may not be allowed to run,
   * but it can still be used for things like decoding and creating buffers
   * or checking output latency
   */
  protected _unsafeAudioContext: AudioContext = new AudioContext();

  protected _audioContext?: AudioContext;
  /** This audio context is only defined when we are sure it is allowed to start running */
  get audioContext() {
    if (!this._audioContext) {
      const ac = new AudioContext();
      if (ac.state === "running") {
        this._audioContext = ac;
      } else {
        ac.close();
      }
    }
    return this._audioContext;
  }

  protected _audioBuffers = new Map<string, AudioBuffer>();

  protected _audioMixers = new Map<string, AudioMixer>();

  protected _audioChannels = new Map<string, Map<string, AudioPlayer>>();

  override onDispose(): Disposable[] {
    this._audioMixers.clear();
    this._audioBuffers.clear();
    for (const c of this._audioChannels.values()) {
      for (const p of c.values()) {
        p.dispose();
      }
    }
    this._audioChannels.clear();
    return super.onDispose();
  }

  async loadAudioBuffer(params: LoadAudioPlayerParams): Promise<AudioBuffer> {
    // An audio context can be used to decode and create buffers,
    // even if it is not allowed to start running yet
    const audioContext = this.audioContext || this._unsafeAudioContext;
    if (params.src) {
      const response = await fetch(params.src);
      const buffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(buffer);
      return audioBuffer;
    }
    if (params.synth && params.tones) {
      const synthBuffer = new SynthBuffer(
        params.synth,
        params.tones,
        audioContext.sampleRate
      );
      const audioBuffer = audioContext.createBuffer(
        1,
        synthBuffer.soundBuffer.length,
        audioContext.sampleRate
      );
      audioBuffer.copyToChannel(synthBuffer.soundBuffer, 0);
      return audioBuffer;
    }
    return audioContext.createBuffer(1, 1, audioContext.sampleRate);
  }

  async getAudioBuffer(params: LoadAudioPlayerParams): Promise<AudioBuffer> {
    const existingAudioBuffer = this._audioBuffers.get(params.key);
    if (existingAudioBuffer) {
      return existingAudioBuffer;
    }
    const audioBuffer = await this.loadAudioBuffer(params);
    if (audioBuffer) {
      this._audioBuffers.set(params.key, audioBuffer);
    }
    return audioBuffer;
  }

  getAudioMixer(mixer: string, gain: number): AudioMixer | undefined {
    const existingAudioMixer = this._audioMixers.get(mixer);
    if (existingAudioMixer) {
      return existingAudioMixer;
    }
    if (this.audioContext) {
      const destination =
        mixer === "main"
          ? this.audioContext.destination
          : this.getAudioMixer("main", gain)?.volumeNode;
      const audioMixer = new AudioMixer(this.audioContext, destination);
      audioMixer.gain = gain;
      this._audioMixers.set(mixer, audioMixer);
      return audioMixer;
    }
    return undefined;
  }

  getAudioChannel(channel: string): Map<string, AudioPlayer> {
    const existingAudioChannel = this._audioChannels.get(channel);
    if (existingAudioChannel) {
      return existingAudioChannel;
    }
    const audioChannel = new Map();
    this._audioChannels.set(channel, audioChannel);
    return audioChannel;
  }

  // TODO: Destroy old audio to free up memory
  destroyAudio(key: string, channel: string) {
    const audioChannel = this._audioChannels.get(channel);
    if (audioChannel) {
      const audioPlayer = audioChannel.get(key);
      if (audioPlayer) {
        audioPlayer.dispose();
      }
      audioChannel.delete(key);
    }
    this._audioBuffers.delete(key);
  }

  async getAudioPlayer(
    params: LoadAudioPlayerParams
  ): Promise<AudioPlayer | undefined> {
    const audioChannel = this.getAudioChannel(params.channel);
    if (audioChannel.get(params.key)) {
      return audioChannel.get(params.key)!;
    }
    const audioBuffer = await this.getAudioBuffer(params);
    if (audioChannel.get(params.key)) {
      return audioChannel.get(params.key)!;
    }
    const audioMixer = this.getAudioMixer(params.mixer, params.mixerGain);
    if (audioBuffer && this.audioContext) {
      const audioPlayer = new AudioPlayer(audioBuffer, this.audioContext, {
        volume: params.volume,
        cues: params.cues,
        loop: params.loop,
        loopStart: params.loopStart,
        loopEnd: params.loopEnd,
        destination: audioMixer?.volumeNode,
      });
      audioChannel.set(params.key, audioPlayer);
      return audioPlayer;
    }
    return undefined;
  }

  async updateAudioPlayer(
    audioPlayer: AudioPlayer,
    update: AudioPlayerUpdate,
    currentTime: number
  ) {
    const updateTime = currentTime + (update.after ?? 0);
    const when = update.now
      ? updateTime
      : audioPlayer.getNextCueTime(updateTime);
    const over = update.over;
    if (update.loop != null) {
      audioPlayer.loop = update.loop;
    }
    if (update.control === "start") {
      audioPlayer.start(when, over, update.fadeto);
    }
    if (update.control === "stop") {
      audioPlayer.stop(when, over);
    }
    if (update.control === "modulate") {
      audioPlayer.fade(when, over, update.fadeto);
    }
  }

  async onConfigureAudioMixer(params: ConfigureAudioMixerParams) {
    const mixer = this.getAudioMixer(params.mixer, params.gain);
    if (mixer) {
      mixer.gain = params.gain;
    }
  }

  async onLoadAudioPlayer(params: LoadAudioPlayerParams) {
    return this.getAudioPlayer(params);
  }

  async onUpdateAudioPlayers(params: UpdateAudioPlayersParams) {
    if (this.audioContext) {
      let currentTime = this.audioContext.currentTime;
      const audioChannel = this.getAudioChannel(params.channel);
      let queueCreatedAt: number | undefined = undefined;
      for (const update of params.updates) {
        if (update.key) {
          const audioPlayer = audioChannel.get(update.key);
          if (audioPlayer) {
            this.updateAudioPlayer(audioPlayer, update, currentTime);
          }
        } else {
          for (const audioPlayer of audioChannel.values()) {
            this.updateAudioPlayer(audioPlayer, update, currentTime);
          }
          if (update.control === "await") {
            if (queueCreatedAt === undefined) {
              queueCreatedAt = currentTime;
            }
            const instances = Array.from(
              audioChannel.values().flatMap((p) => p.instances)
            );
            if (instances.length > 0) {
              for (const instance of instances) {
                instance.queueCreatedAt = queueCreatedAt;
              }
              await Promise.all(instances.map((instance) => instance.ended));
              if (
                instances.some(
                  (instance) =>
                    instance.queueCreatedAt == null ||
                    instance.queueCreatedAt !== queueCreatedAt
                )
              ) {
                // An instance was forcedly stopped, disposed, or interrupted by a new queue
                // (instead of naturally finishing).
                // So, skip the remaining queued updates
                break;
              }
              currentTime = this.audioContext.currentTime;
            }
          }
        }
      }
    }
  }

  override onStep(deltaMS: number): void {
    if (this.audioContext) {
      const scheduledTime = this.audioContext.currentTime;
      for (const c of this._audioChannels.values()) {
        for (const p of c.values()) {
          p.step(scheduledTime, deltaMS);
        }
      }
    }
  }

  override onPause(): void {
    if (this.audioContext) {
      const scheduledTime = this.audioContext.currentTime;
      for (const c of this._audioChannels.values()) {
        for (const p of c.values()) {
          p.pause(scheduledTime);
        }
      }
    }
  }

  override onUnpause(): void {
    if (this.audioContext) {
      const scheduledTime = this.audioContext.currentTime;
      for (const c of this._audioChannels.values()) {
        for (const p of c.values()) {
          p.unpause(scheduledTime);
        }
      }
    }
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (ConfigureAudioMixerMessage.type.isRequest(msg)) {
      await this.onConfigureAudioMixer(msg.params);
      return ConfigureAudioMixerMessage.type.result(msg.params);
    }
    if (LoadAudioPlayerMessage.type.isRequest(msg)) {
      await this.onLoadAudioPlayer(msg.params);
      const outputLatency =
        window.AudioContext && "outputLatency" in window.AudioContext.prototype
          ? (this.audioContext || this._unsafeAudioContext)?.outputLatency ?? 0
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
