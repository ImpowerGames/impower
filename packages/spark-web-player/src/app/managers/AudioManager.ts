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

  /** Keys of players built from synth data. A synth buffer is generated per
   *  line with a tone suffix in its key, so nothing ever asks for it again:
   *  its player is dropped as soon as its sound has ended, or every line
   *  leaks one buffer. File-backed buffers live in the shared asset cache. */
  protected _synthKeys = new Set<string>();

  protected _audioMixers = new Map<string, AudioMixer>();

  protected _audioChannels = new Map<string, Map<string, AudioPlayer>>();

  /**
   * Measures what each mixer is actually outputting (#273). Audio is the one
   * part of the engine that otherwise can only be checked by listening to it,
   * which is how #268 -- every authored character voice silent -- went
   * unnoticed. Started on demand; it costs nothing until someone asks.
   */
  protected _audioProbe = new AudioProbe(() => this._audioMixers.entries());
  get audioProbe() {
    return this._audioProbe;
  }

  override async onInit(): Promise<void> {
    this.exposeAudioProbe();
  }

  /**
   * Publishes the probe as `window.__audioProbe()` (#273).
   *
   * Deliberately a plain global rather than something behind the debugging
   * toggle: the whole point is that anyone -- a developer at a console, or an
   * agent that cannot hear -- can ask "is this making a sound?" in one call,
   * without first having to find and enable a setting. It starts the sampler
   * on first use, so it costs nothing until asked.
   */
  /** The exact function this manager published, so it can tell its own apart. */
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
        // Null means the game has no audio graph yet, which is a different
        // problem from "the graph is silent" and worth telling apart.
        audioContext: this.app.audioContext ? this.app.audioContext.state : null,
        mixers: this._audioProbe.sample(),
      };
    };
    (window as any).__audioProbe = this._exposedProbe;
  }

  override onDispose() {
    this._audioProbe.stop();
    // Only retract our own. In preview the Application is rebuilt on every
    // edit, so the outgoing manager's dispose can land AFTER the incoming
    // one has published its probe -- deleting unconditionally would then wipe
    // a live probe and leave `window.__audioProbe` undefined for the rest of
    // the session, which is exactly what it looked like when this was found.
    if (
      typeof window !== "undefined" &&
      (window as any).__audioProbe === this._exposedProbe
    ) {
      delete (window as any).__audioProbe;
    }
    this._audioMixers.clear();
    this._synthKeys.clear();
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
    params: LoadAudioPlayerParams,
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
        audioContext.sampleRate,
      );
      const audioBuffer = audioContext.createBuffer(
        1,
        synthBuffer.soundBuffer.length,
        audioContext.sampleRate,
      );
      // `soundBuffer` is a bare `Float32Array` (TS 5.7+ widens this to
      // `Float32Array<ArrayBufferLike>`), but `copyToChannel` wants the
      // `<ArrayBuffer>` form; the runtime buffer is always a plain ArrayBuffer.
      audioBuffer.copyToChannel(
        synthBuffer.soundBuffer as Float32Array<ArrayBuffer>,
        0,
      );
      return audioBuffer;
    }
    return audioContext.createBuffer(1, 1, audioContext.sampleRate);
  }

  /** Decode (or synthesize) the buffer for these parameters. The asset cache
   *  calls this to make audio resident ahead of need. */
  decodeAudioBuffer(params: LoadAudioPlayerParams): Promise<AudioBuffer> {
    return this.loadAudioBuffer(params);
  }

  /** Keys of every player currently making sound: what the cache must keep
   *  whatever else it evicts. */
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
      // Never cached; see `_synthKeys`.
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
    // Through the cache, so a buffer decoded for playback is the one a later
    // preload finds resident, and the reverse. The player's own pin lasts
    // only until the buffer is in hand; from then on "playing" keeps it.
    const pin = `play:${params.key}`;
    await cache.request([{ kind: "audio", params }], 0, pin);
    cache.release([pin], false);
    return cache.getAudio(params.key) ?? this.loadAudioBuffer(params);
  }

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
          : this.getAudioMixer("main", gain)?.volumeNode;
      const audioMixer = new AudioMixer(this.app.audioContext, destination);
      if (gain != null) {
        audioMixer.gain = gain;
      }
      this._audioMixers.set(mixer, audioMixer);
      // Begin sampling as soon as there is an audio graph at all. Starting it
      // lazily on the first `__audioProbe()` call would be too late to be
      // useful: by the time anyone thinks to ask whether a line beeped, the
      // beep is over, and `lastNonSilentAt` -- the field that exists to answer
      // exactly that -- would still read null.
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

  /** Drop a synth player once its sound has ended: its buffer was generated
   *  for this one line and nothing will ask for it again. */
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
    currentTime: number,
    channel?: string,
    key?: string,
  ) {
    const updateTime = currentTime + (update.after ?? 0);
    const when = update.now
      ? updateTime
      : audioPlayer.getNextCueTime(updateTime);
    const over = update.over;
    const gain = update.to;
    const at = update.at;
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
            this.updateAudioPlayer(
              audioPlayer,
              update,
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
      const outputLatency =
        window.AudioContext && "outputLatency" in window.AudioContext.prototype
          ? ((this.app.audioContext || this.unsafeAudioContext)
              ?.outputLatency ?? 0)
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
