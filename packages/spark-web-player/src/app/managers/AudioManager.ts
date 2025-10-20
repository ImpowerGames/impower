import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import AudioMixer from "../../../../spark-dom/src/classes/AudioMixer";
import AudioPlayer from "../../../../spark-dom/src/classes/AudioPlayer";
import { SynthBuffer } from "../../../../spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { ConfigureAudioMixerMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/ConfigureAudioMixerMessage";
import { LoadAudioPlayerMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/LoadAudioPlayerMessage";
import { UpdateAudioPlayersMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/UpdateAudioPlayersMessage";
import { AudioPlayerUpdate } from "../../../../spark-engine/src/game/modules/audio/types/AudioPlayerUpdate";
import { ConfigureAudioMixerParams } from "../../../../spark-engine/src/game/modules/audio/types/ConfigureAudioMixerParams";
import { LoadAudioPlayerParams } from "../../../../spark-engine/src/game/modules/audio/types/LoadAudioPlayerParams";
import { Midi } from "../../../../spark-engine/src/game/modules/audio/types/Midi";
import { ToneSequence } from "../../../../spark-engine/src/game/modules/audio/types/ToneSequence";
import { UpdateAudioPlayersParams } from "../../../../spark-engine/src/game/modules/audio/types/UpdateAudioPlayersParams";
import { convertMidiToToneSequences } from "../../../../spark-engine/src/game/modules/audio/utils/convertMidiToToneSequences";
import { parseMidi } from "../../../../spark-engine/src/game/modules/audio/utils/parseMidi";
import { Manager } from "../Manager";

export default class AudioManager extends Manager {
  /**
   * This audio context may not be allowed to run,
   * but it can still be used for things like decoding and creating buffers
   * or checking output latency
   */
  protected _unsafeAudioContext?: AudioContext;
  protected get unsafeAudioContext() {
    if (!this._unsafeAudioContext) {
      this._unsafeAudioContext = new AudioContext();
    }
    return this._unsafeAudioContext!;
  }

  protected _audioBuffers = new Map<string, AudioBuffer>();

  protected _audioMixers = new Map<string, AudioMixer>();

  protected _audioChannels = new Map<string, Map<string, AudioPlayer>>();

  override onDispose() {
    this._audioMixers.clear();
    this._audioBuffers.clear();
    for (const c of this._audioChannels.values()) {
      for (const p of c.values()) {
        p.dispose();
      }
    }
    this._audioChannels.clear();
  }

  protected getMixerName(channel: string | undefined): string {
    const mixer = this.app.context?.channel?.[channel || "sound"]?.mixer;
    const mixerName = (typeof mixer === "string" ? mixer : mixer?.$name) || "";
    return mixerName || channel || "sound";
  }

  protected getMixerGain(channel: string | undefined): number {
    const mixer = this.app.context.mixer?.[this.getMixerName(channel)];
    return mixer?.gain ?? 1;
  }

  protected async loadAudioBuffer(
    params: LoadAudioPlayerParams
  ): Promise<AudioBuffer> {
    // An audio context can be used to decode and create buffers,
    // even if it is not allowed to start running yet
    const audioContext = this.app.audioContext || this.unsafeAudioContext;
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

  protected async getAudioBuffer(
    params: LoadAudioPlayerParams
  ): Promise<AudioBuffer> {
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

  protected getAudioMixer(
    mixer: string,
    gain?: number
  ): AudioMixer | undefined {
    const existingAudioMixer = this._audioMixers.get(mixer);
    if (existingAudioMixer) {
      return existingAudioMixer;
    }
    if (this.app.audioContext) {
      const destination =
        mixer === "main"
          ? this.app.audioContext.destination
          : this.getAudioMixer("main", gain)?.volumeNode;
      const audioMixer = new AudioMixer(this.app.audioContext, destination);
      if (gain != null) {
        audioMixer.gain = gain;
      }
      this._audioMixers.set(mixer, audioMixer);
      return audioMixer;
    }
    return undefined;
  }

  protected getAudioChannel(channel: string): Map<string, AudioPlayer> {
    const existingAudioChannel = this._audioChannels.get(channel);
    if (existingAudioChannel) {
      return existingAudioChannel;
    }
    const audioChannel = new Map();
    this._audioChannels.set(channel, audioChannel);
    return audioChannel;
  }

  // TODO: Destroy old audio to free up memory
  protected destroyAudio(key: string, channel: string) {
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

  protected async getAudioPlayer(
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
    const mixerName = this.getMixerName(params.channel);
    const mixerGain = this.getMixerGain(params.channel);
    const audioMixer = this.getAudioMixer(mixerName, mixerGain);
    if (audioBuffer && this.app.audioContext) {
      const audioPlayer = new AudioPlayer(audioBuffer, this.app.audioContext, {
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

  protected async updateAudioPlayer(
    audioPlayer: AudioPlayer,
    update: AudioPlayerUpdate,
    currentTime: number
  ) {
    const updateTime = currentTime + (update.after ?? 0);
    const when = update.now
      ? updateTime
      : audioPlayer.getNextCueTime(updateTime);
    const over = update.over;
    const gain = update.fadeto;
    const at = update.at;
    if (update.loop != null) {
      audioPlayer.loop = update.loop;
    }
    if (update.control === "start") {
      audioPlayer.start(when, over, gain, at);
    }
    if (update.control === "stop") {
      audioPlayer.stop(when, over);
    }
    if (update.control === "fade") {
      audioPlayer.fade(when, over, gain);
    }
  }

  protected async onConfigureAudioMixer(params: ConfigureAudioMixerParams) {
    const mixer = this.getAudioMixer(params.mixer, params.gain);
    if (mixer) {
      mixer.gain = params.gain;
    }
  }

  protected async onLoadAudioPlayer(params: LoadAudioPlayerParams) {
    return this.getAudioPlayer(params);
  }

  protected async onUpdateAudioPlayers(params: UpdateAudioPlayersParams) {
    if (this.app.audioContext) {
      let currentTime = this.app.audioContext.currentTime;
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
              currentTime = this.app.audioContext.currentTime;
            }
          }
        }
      }
    }
  }

  override onSkip(seconds: number): void {
    if (this.app.audioContext) {
      const scheduledTime = this.app.audioContext.currentTime;
      for (const c of this._audioChannels.values()) {
        for (const p of c.values()) {
          p.step(scheduledTime, seconds);
        }
      }
    }
  }

  override onPause(): void {
    if (this.app.audioContext) {
      const scheduledTime = this.app.audioContext.currentTime;
      for (const c of this._audioChannels.values()) {
        for (const p of c.values()) {
          p.pause(scheduledTime);
        }
      }
    }
  }

  override onUnpause(): void {
    if (this.app.audioContext) {
      const scheduledTime = this.app.audioContext.currentTime;
      for (const c of this._audioChannels.values()) {
        for (const p of c.values()) {
          p.unpause(scheduledTime);
        }
      }
    }
  }

  loadAudioPlayer(
    params: LoadAudioPlayerParams
  ): Promise<AudioPlayer | undefined> {
    return this.onLoadAudioPlayer(params);
  }

  updateAudioPlayers(params: UpdateAudioPlayersParams): Promise<void> {
    return this.onUpdateAudioPlayers(params);
  }

  parseMidi(arrayBuffer: ArrayBuffer): Midi {
    return parseMidi(arrayBuffer);
  }

  convertMidiToToneSequences(midi: Midi): ToneSequence[] {
    return convertMidiToToneSequences(
      midi,
      (this.app.audioContext || this.unsafeAudioContext)?.sampleRate
    );
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
          ? (this.app.audioContext || this.unsafeAudioContext)?.outputLatency ??
            0
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
