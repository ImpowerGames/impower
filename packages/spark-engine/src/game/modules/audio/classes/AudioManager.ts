import { Manager } from "../../../core/classes/Manager";
import { AudioEvent } from "../../../core/types/SequenceEvent";
import { Channel } from "../specs/Channel";
import { Synth } from "../specs/Synth";
import { AudioData } from "../types/AudioData";
import { AudioUpdate } from "../types/AudioUpdate";
import { ChannelState } from "../types/ChannelState";
import { parseTones } from "../utils/parseTones";
import {
  AudioLoadMessage,
  AudioLoadMessageMap,
} from "./messages/AudioLoadMessage";
import {
  AudioUpdateMessage,
  AudioUpdateMessageMap,
} from "./messages/AudioUpdateMessage";

export interface AudioConfig {}

export interface AudioState {
  channels?: Record<string, ChannelState>;
}

export type AudioMessageMap = AudioLoadMessageMap & AudioUpdateMessageMap;

export class AudioManager extends Manager<AudioState, AudioMessageMap> {
  protected _onReady: Map<string, undefined | (() => void)[]> = new Map();

  protected _ready = new Set<string>();

  protected _updates: AudioUpdate[] = [];

  protected _playing: Record<string, Map<string, AudioUpdate>> = {};

  override async onRestore() {
    this._updates.length = 0;
    if (this._state.channels) {
      const audioToLoad = new Set<AudioData>();
      const updates: AudioUpdate[] = [];
      Object.keys(this._state.channels).forEach((channel) => {
        const channelState = this._state.channels?.[channel];
        if (channelState?.looping) {
          Object.entries(channelState.looping).forEach(([id, update]) => {
            const dataArray = this.getAudioData(id);
            if (dataArray) {
              dataArray.forEach((d) => {
                audioToLoad.add(d);
                this.updatePlaying(channel, update);
                updates.push(update);
              });
            }
          });
        }
      });
      await this.loadAllAudio(Array.from(audioToLoad));
      this._updates.push(...updates);
    }
  }

  override onUpdate() {
    if (this._updates.length > 0) {
      // Flush updates that should be handled this frame
      const updates = [
        ...this._updates.map((u) => ({
          ...u,
          volume: u.volume * this.getVolumeMultiplier(u.channel, u.name),
        })),
      ];
      this.emit(AudioUpdateMessage.type.request(updates));
      this._updates.length = 0;
    }
    return true;
  }

  protected _loadAudio(data: AudioData, callback?: () => void) {
    if (this._ready.has(data.id)) {
      callback?.();
      return;
    }
    if (callback) {
      if (!this._onReady.get(data.id)) {
        this._onReady.set(data.id, []);
      }
      const listeners = this._onReady.get(data.id);
      listeners?.push(callback);
    }
    if (!this._context.system?.simulating) {
      this.emit(AudioLoadMessage.type.request(data)).then((msg) => {
        const audioId = msg.result;
        if (audioId) {
          this._ready.add(audioId);
          const onReadyCallbacks = this._onReady.get(audioId);
          if (onReadyCallbacks) {
            onReadyCallbacks.forEach((callback) => callback?.());
          }
        }
      });
    }
  }

  async loadAudio(data: AudioData): Promise<void> {
    await new Promise<void>((resolve) => {
      this._loadAudio(data, resolve);
    });
  }

  async loadAllAudio(dataArray: AudioData[]): Promise<void> {
    await Promise.all(dataArray.map((d) => this.loadAudio(d)));
  }

  protected getModulatedVolume(obj?: { mute?: boolean; volume?: number }) {
    let v =
      obj &&
      typeof obj === "object" &&
      "volume" in obj &&
      typeof obj.volume === "number"
        ? obj.volume
        : 1;
    let m =
      obj && typeof obj === "object" && "mute" in obj
        ? Boolean(obj.mute)
        : false;
    if (m) {
      return 0;
    }
    return v;
  }

  getVolumeMultiplier(channel: string, name: string) {
    return (
      this.getModulatedVolume(this._context?.["mixer"]?.["main"]) *
      this.getModulatedVolume(
        this._context?.["channel"]?.[channel]?.["mixer"]
      ) *
      this.getModulatedVolume(this._state?.channels?.[channel]) *
      (name
        ? this.getModulatedVolume(
            this._context?.["audio"]?.[name] ?? this._context?.["synth"]?.[name]
          )
        : 1)
    );
  }

  protected getData(asset: unknown, suffix: string): AudioData | null {
    if (!asset) {
      return null;
    }
    if (typeof asset !== "object") {
      return null;
    }
    const d: AudioData = {
      id: "",
      name: "",
      volume: 1,
    };
    if ("$name" in asset && typeof asset.$name === "string") {
      d.id = asset.$name + suffix;
      d.name = asset.$name;
    }
    if ("src" in asset && typeof asset.src === "string") {
      d.src = asset.src;
    }
    if ("volume" in asset && typeof asset.volume === "number") {
      d.volume = asset.volume;
    }
    if ("cues" in asset && Array.isArray(asset.cues) && asset.cues.length > 0) {
      d.cues = asset.cues;
    }
    if ("shape" in asset) {
      d.synth = asset as Synth;
    }
    d.tones = this.parseTones(d.id);
    return d;
  }

  protected getAudioData(id: string): AudioData[] {
    const indexOfFirstDash = id.indexOf("-");
    const name = indexOfFirstDash >= 0 ? id.slice(0, indexOfFirstDash) : id;
    const suffix = indexOfFirstDash >= 0 ? id.slice(indexOfFirstDash) : "";
    if (!name) {
      return [];
    }
    const compiled =
      this._context?.["audio"]?.[name] ||
      this._context?.["audio_group"]?.[name] ||
      this._context?.["synth"]?.[name] ||
      this._context?.["array"]?.[name];
    if (!compiled) {
      return [];
    }
    if (typeof compiled !== "object") {
      return [];
    }
    if (Array.isArray(compiled)) {
      const dataArray: AudioData[] = [];
      compiled.forEach((asset) => {
        const d = this.getData(asset, suffix);
        if (d) {
          dataArray.push(d);
        }
      });
      return dataArray;
    }
    if ("assets" in compiled && Array.isArray(compiled.assets)) {
      const dataArray: AudioData[] = [];
      compiled.assets.forEach((asset: unknown) => {
        const d = this.getData(asset, suffix);
        if (d) {
          if (
            "cues" in compiled &&
            Array.isArray(compiled.cues) &&
            compiled.cues.length > 0
          ) {
            d.cues = d.cues ?? compiled.cues;
          }
          dataArray.push(d);
        }
      });
      return dataArray;
    }
    const d = this.getData(compiled, suffix);
    if (d) {
      return [d];
    }
    return [];
  }

  protected getAllAudioData(ids: string[]): AudioData[] {
    return ids.flatMap((n) => this.getAudioData(n));
  }

  protected parseTones(id: string) {
    const indexOfFirstDash = id.indexOf("-");
    const suffix = indexOfFirstDash >= 0 ? id.slice(indexOfFirstDash + 1) : "";
    if (suffix) {
      return parseTones(suffix, "-");
    }
    return [];
  }

  protected process(
    channel: string,
    data: AudioData,
    event: AudioEvent
  ): AudioUpdate {
    const channelDef: Channel = this._context["channel"]?.[channel];
    const id = data.id;
    const name = data.name;
    const cues =
      event.params?.load || event.params?.start ? data.cues : undefined;
    const scheduled = Boolean(event.params?.schedule);
    const playing = !event.params?.stop && !event.params?.unload;
    const looping = Boolean(
      !event.params?.noloop && (event.params?.loop || channelDef?.loop)
    );
    const volume = event.params?.mute ? 0 : event.params?.volume ?? 1;
    const after = (event.enter ?? 0) + (event.params?.after ?? 0);
    const over =
      event.params?.over ??
      (event.params?.stop || event.params?.mute || event.params?.volume === 0
        ? channelDef?.fadeout
        : channelDef?.fadein) ??
      0;
    const update: AudioUpdate = {
      id,
      name,
      channel,
      cues,
      scheduled,
      playing,
      looping,
      volume,
      after,
      over,
    };
    return update;
  }

  protected updatePlaying(channel: string, update: AudioUpdate) {
    if (update.playing) {
      this._playing[channel] ??= new Map();
      this._playing[channel]!.set(update.id, update);
    } else {
      this._playing[channel]?.delete(update.id);
    }
  }

  protected saveState(channel: string, update: AudioUpdate) {
    const id = update.id;
    this._state.channels ??= {};
    this._state.channels[channel] ??= {};
    if (!update.playing || !update.looping) {
      delete this._state?.channels?.[channel]?.looping?.[id];
    } else {
      this._state.channels[channel]!.looping ??= {};
      const currentState = this._state.channels[channel]!.looping![id];
      this._state.channels[channel]!.looping![id] = {
        ...update,
        cues: update.cues ?? currentState?.cues,
      };
    }
  }

  queue(channel: string, sequence: AudioEvent[], autoTrigger = false): number {
    const audioToLoad = new Set<AudioData>();
    const updates: AudioUpdate[] = [];
    sequence.forEach((event) => {
      this.getAllAudioData(event.audio).forEach((d) => {
        audioToLoad.add(d);
        const update = this.process(channel, d, event);
        this.updatePlaying(channel, update);
        this.saveState(channel, update);
        updates.push(update);
      });
    });
    const id = this.nextTriggerId();
    const trigger = () => {
      this._updates.push(...updates);
    };
    this.loadAllAudio(Array.from(audioToLoad)).then(() => {
      this.enableTrigger(id, trigger);
      if (autoTrigger) {
        trigger();
      }
    });
    return id;
  }

  stopChannel(channel: string, after?: number, over?: number) {
    const channelDef: Channel = this._context["channel"]?.[channel];
    const playingOnChannel = this._playing[channel];
    if (playingOnChannel) {
      const updates: AudioUpdate[] = [];
      playingOnChannel.forEach((_state, id) => {
        const dataArray = this.getAudioData(id);
        if (dataArray) {
          dataArray.forEach((d) => {
            const event: AudioEvent = {
              audio: [id],
              params: {
                stop: true,
                after,
                over: over ?? channelDef?.fadeout ?? 0,
              },
            };
            const update = this.process(channel, d, event);
            updates.push(update);
          });
        }
      });
      this._updates.push(...updates);
    }
  }

  fadeChannel(channel: string, volume: number, after?: number, over?: number) {
    const channelState = this._state.channels?.[channel];
    if (channelState) {
      channelState.volume = volume;
    }
    const playingOnChannel = this._playing[channel];
    if (playingOnChannel) {
      const updates: AudioUpdate[] = [];
      playingOnChannel.forEach((state, id) => {
        const dataArray = this.getAudioData(id);
        dataArray.forEach((d) => {
          const event: AudioEvent = {
            audio: [id],
            params: {
              volume: state.volume,
              after,
              over: over ?? 0,
            },
          };
          const update = this.process(channel, d, event);
          updates.push(update);
        });
      });
      this._updates.push(...updates);
    }
  }
}
