import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import AudioMixer from "../../../../spark-dom/src/classes/AudioMixer";
import AudioPlayer from "../../../../spark-dom/src/classes/AudioPlayer";
import AudioProbe from "./AudioProbe";
import { SynthBuffer } from "../../../../spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { ConfigureAudioMixerMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/ConfigureAudioMixerMessage";
import { LoadAudioPlayerMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/LoadAudioPlayerMessage";
import { UpdateAudioPlayersMessage } from "../../../../spark-engine/src/game/modules/audio/classes/messages/UpdateAudioPlayersMessage";
import type { AudioPlayerUpdate } from "../../../../spark-engine/src/game/modules/audio/types/AudioPlayerUpdate";
import type { ConfigureAudioMixerParams } from "../../../../spark-engine/src/game/modules/audio/types/ConfigureAudioMixerParams";
import type { LoadAudioPlayerParams } from "../../../../spark-engine/src/game/modules/audio/types/LoadAudioPlayerParams";
import type { Midi } from "../../../../spark-engine/src/game/modules/audio/types/Midi";
import type { ToneSequence } from "../../../../spark-engine/src/game/modules/audio/types/ToneSequence";
import type { UpdateAudioPlayersParams } from "../../../../spark-engine/src/game/modules/audio/types/UpdateAudioPlayersParams";
import { convertMidiToToneSequences } from "../../../../spark-engine/src/game/modules/audio/utils/convertMidiToToneSequences";
import { parseMidi } from "../../../../spark-engine/src/game/modules/audio/utils/parseMidi";
import { Manager } from "../Manager";

export default class AudioManager extends Manager {
  protected _unsafeAudioContext?: AudioContext;
  protected get unsafeAudioContext() {
    if (!this._unsafeAudioContext) {
      this._unsafeAudioContext = new AudioContext();
    }
    return this._unsafeAudioContext!;
  }

  protected _synthKeys = new Set<string>();

  protected _audioMixers = new Map<string, AudioMixer>();

  protected _audioChannels = new Map<string, Map<string, AudioPlayer>>();

  protected _audioProbe = new AudioProbe(() => this._audioMixers.entries());
  get audioProbe() {
    return this._audioProbe;
  }

  override async onInit(): Promise<void> {
    this.exposeAudioProbe();
  }

  protected _exposedProbe?: () => unknown;

  protected exposeAudioProbe(): void {
    if (typeof window === "undefined") {
      return;
    }
    this._exposedProbe = () => {
      if (!this._audioProbe.running) {
        this._audioProbe.start();
      }
      return {
        audioContext: this.app.audioContext ? this.app.audioContext.state : null,
        mixers: this._audioProbe.sample(),
      };
    };
    (window as any).__audioProbe = this._exposedProbe;
  }

  override onDispose() {
    this._audioProbe.stop();
    if (
      typeof window !== "undefined" &&
      (window as any).__audioProbe === this._exposedProbe
    ) {
      delete (window as any).__audioProbe;
    }
    this._audioMixers.clear();
    this._mixerGains.clear();
    this._waitingMovies.clear();
    this._synthKeys.clear();
    for (const c of this._audioChannels.values()) {
      for (const p of c.values()) {
        p.dispose();
      }
    }
    this._audioChannels.clear();
  }

  protected async loadAudioBuffer(
    params: LoadAudioPlayerParams,
  ): Promise<AudioBuffer> {
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
        audioContext.sampleRate,
      );
      const audioBuffer = audioContext.createBuffer(
        1,
        synthBuffer.soundBuffer.length,
        audioContext.sampleRate,
      );
      audioBuffer.copyToChannel(
        synthBuffer.soundBuffer as Float32Array<ArrayBuffer>,
        0,
      );
      return audioBuffer;
    }
    return audioContext.createBuffer(1, 1, audioContext.sampleRate);
  }

  decodeAudioBuffer(params: LoadAudioPlayerParams): Promise<AudioBuffer> {
    return this.loadAudioBuffer(params);
  }

  playingKeys(): string[] {
    const keys: string[] = [];
    for (const channel of this._audioChannels.values()) {
      for (const [key, player] of channel) {
        if (player.playing) {
          keys.push(key);
        }
      }
    }
    return keys;
  }

  protected async getAudioBuffer(
    params: LoadAudioPlayerParams,
  ): Promise<AudioBuffer> {
    if (params.synth && params.tones) {
      return this.loadAudioBuffer(params);
    }
    const cache = this.app.assets?.cache;
    if (!cache || !params.src) {
      return this.loadAudioBuffer(params);
    }
    const resident = cache.getAudio(params.key);
    if (resident) {
      return resident;
    }
    const pin = `play:${params.key}`;
    await cache.request([{ kind: "audio", params }], 0, pin);
    cache.release([pin], false);
    return cache.getAudio(params.key) ?? this.loadAudioBuffer(params);
  }

  protected _mixerGains = new Map<string, number>();

  protected getAudioMixer(
    mixer: string,
    gain?: number,
  ): AudioMixer | undefined {
    const existingAudioMixer = this._audioMixers.get(mixer);
    if (existingAudioMixer) {
      return existingAudioMixer;
    }
    if (this.app.audioContext) {
      const destination =
        mixer === "main"
          ? this.app.audioContext.destination
          : this.getAudioMixer("main")?.volumeNode;
      const audioMixer = new AudioMixer(this.app.audioContext, destination);
      const initialGain = this._mixerGains.get(mixer) ?? gain;
      if (initialGain != null) {
        audioMixer.gain = initialGain;
      }
      this._audioMixers.set(mixer, audioMixer);
      this._audioProbe.start();
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

  protected pruneWhenDone(channel: string, key: string, player: AudioPlayer) {
    if (!this._synthKeys.has(key)) {
      return;
    }
    const instance = player.instances[player.instances.length - 1];
    if (!instance) {
      return;
    }
    instance.ended.then(() => {
      if (player.playing) {
        return;
      }
      const audioChannel = this._audioChannels.get(channel);
      if (audioChannel?.get(key) === player) {
        audioChannel.delete(key);
        this._synthKeys.delete(key);
        player.dispose();
      }
    });
  }

  protected async getAudioPlayer(
    params: LoadAudioPlayerParams,
  ): Promise<AudioPlayer | undefined> {
    const audioChannel = this.getAudioChannel(params.channel);
    if (audioChannel.get(params.key)) {
      return audioChannel.get(params.key)!;
    }
    const audioBuffer = await this.getAudioBuffer(params);
    if (audioChannel.get(params.key)) {
      return audioChannel.get(params.key)!;
    }
    const mixerName = params.mixer || params.channel || "sound";
    const audioMixer = this.getAudioMixer(mixerName, params.mixerGain ?? 1);
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
      if (params.synth && params.tones) {
        this._synthKeys.add(params.key);
      }
      return audioPlayer;
    }
    return undefined;
  }

  protected async updateAudioPlayer(
    audioPlayer: AudioPlayer,
    update: AudioPlayerUpdate,
    startTime: number,
    currentTime: number,
    channel?: string,
    key?: string,
  ) {
    const updateTime = startTime + (update.after ?? 0);
    const lateness = Math.max(0, currentTime - updateTime);
    const due = updateTime + lateness;
    const when = update.now ? due : audioPlayer.getNextCueTime(due);
    const over = update.over;
    const gain = update.to;
    const playsWhenDue = when - due < 1e-6;
    const at =
      lateness > 0 && playsWhenDue ? (update.at ?? 0) + lateness : update.at;
    if (update.loop != null) {
      audioPlayer.loop = update.loop;
    }
    if (update.control === "start") {
      audioPlayer.start(when, over, gain, at);
      if (channel && key) {
        this.pruneWhenDone(channel, key, audioPlayer);
      }
    }
    if (update.control === "stop") {
      audioPlayer.stop(when, over);
    }
    if (update.control === "fade") {
      audioPlayer.fade(when, over, gain);
    }
  }

  protected _waitingMovies = new Map<
    HTMLMediaElement,
    { mixer: string; mixerGain: number }
  >();

  connectMovie(video: HTMLMediaElement, mixer: string, mixerGain: number) {
    const audioContext = this.app.audioContext;
    if (!audioContext) {
      this._waitingMovies.set(video, { mixer, mixerGain });
      return;
    }
    this._waitingMovies.delete(video);
    const audioMixer = this.getAudioMixer(mixer, mixerGain);
    if (!audioMixer) {
      return;
    }
    let source = (video as any).__sdAudioSource as
      | MediaElementAudioSourceNode
      | undefined;
    if (source && source.context !== audioContext) {
      return;
    }
    if (!source) {
      source = audioContext.createMediaElementSource(video);
      (video as any).__sdAudioSource = source;
    }
    if ((video as any).__sdAudioTarget === audioMixer.volumeNode) {
      return;
    }
    source.disconnect();
    source.connect(audioMixer.volumeNode);
    (video as any).__sdAudioTarget = audioMixer.volumeNode;
  }

  disconnectMovie(video: HTMLMediaElement) {
    this._waitingMovies.delete(video);
    ((video as any).__sdAudioSource as AudioNode | undefined)?.disconnect();
    delete (video as any).__sdAudioTarget;
  }

  onAudioContextRunning() {
    for (const [video, { mixer, mixerGain }] of this._waitingMovies) {
      if (video.isConnected) {
        this.connectMovie(video, mixer, mixerGain);
      } else {
        this._waitingMovies.delete(video);
      }
    }
  }

  protected async onConfigureAudioMixer(params: ConfigureAudioMixerParams) {
    this._mixerGains.set(params.mixer, params.gain);
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
      let startTime =
        (params.time != null
          ? this.app.audioClock.toContextTime(params.time)
          : undefined) ?? currentTime;
      const audioChannel = this.getAudioChannel(params.channel);
      let queueCreatedAt: number | undefined = undefined;
      for (const update of params.updates) {
        if (update.key) {
          const audioPlayer = audioChannel.get(update.key);
          if (audioPlayer) {
            this.updateAudioPlayer(
              audioPlayer,
              update,
              startTime,
              currentTime,
              params.channel,
              update.key,
            );
          }
        } else {
          for (const [key, audioPlayer] of audioChannel) {
            this.updateAudioPlayer(
              audioPlayer,
              update,
              startTime,
              currentTime,
              params.channel,
              key,
            );
          }
          if (update.control === "await") {
            if (queueCreatedAt === undefined) {
              queueCreatedAt = currentTime;
            }
            const instances = Array.from(
              audioChannel.values().flatMap((p) => p.instances),
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
                    instance.queueCreatedAt !== queueCreatedAt,
                )
              ) {
                break;
              }
              currentTime = this.app.audioContext.currentTime;
              startTime = currentTime;
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
    params: LoadAudioPlayerParams,
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
      (this.app.audioContext || this.unsafeAudioContext)?.sampleRate,
    );
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (ConfigureAudioMixerMessage.type.isRequest(msg)) {
      await this.onConfigureAudioMixer(msg.params);
      return ConfigureAudioMixerMessage.type.result(msg.params);
    }
    if (LoadAudioPlayerMessage.type.isRequest(msg)) {
      await this.onLoadAudioPlayer(msg.params);
      return LoadAudioPlayerMessage.type.result(msg.params);
    }
    if (UpdateAudioPlayersMessage.type.isRequest(msg)) {
      await this.onUpdateAudioPlayers(msg.params);
      return UpdateAudioPlayersMessage.type.result(msg.params);
    }
    return undefined;
  }
}
