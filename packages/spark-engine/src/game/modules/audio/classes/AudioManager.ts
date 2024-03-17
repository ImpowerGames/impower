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

  protected _channelsPlaying: Record<string, Record<string, AudioData>> = {};

  protected _updates: AudioUpdate[] = [];

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
                // populate update with latest matching cues
                const syncedTo = update.syncedTo;
                if (syncedTo) {
                  const [syncedToType, syncedToName] =
                    syncedTo?.split(".") || [];
                  if (syncedToType && syncedToName) {
                    update.cues =
                      this._context?.[syncedToType]?.[syncedToName]?.cues;
                  }
                }
                updates.push(update);
              });
            }
          });
        }
      });
      await this.loadAllAudio(Array.from(audioToLoad));
      this.update(...updates);
    }
  }

  override onUpdate() {
    if (this._updates.length > 0) {
      // Flush updates that should be handled this frame
      this.emit(AudioUpdateMessage.type.request([...this._updates]));
      this._updates.length = 0;
    }
    return true;
  }

  update(...updates: AudioUpdate[]) {
    this._updates.push(
      ...updates.map((u) => ({ ...u, level: this.getChannelLevel(u.channel) }))
    );
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

  protected getChannelLevel(channel: string) {
    const channelMixerName =
      this._context?.["channel"]?.[channel]?.["mixer"] || "";
    return (
      this.getModulatedVolume(this._context?.["mixer"]?.["main"]) *
      this.getModulatedVolume(this._context?.["mixer"]?.[channelMixerName])
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
      type: "",
      name: "",
      volume: 1,
    };
    if ("$type" in asset && typeof asset.$type === "string") {
      d.type = asset.$type;
    }
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
      d.syncedTo = `${d.type}.${d.name}`;
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
            if (!d.cues) {
              d.syncedTo = `${compiled.$type}.${compiled.$name}`;
              d.cues = compiled.cues;
            }
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
    event: AudioEvent,
    data: AudioData
  ): AudioUpdate {
    const id = data?.id;
    const name = data?.name;
    const cues = data?.cues && data.cues?.length > 0 ? data.cues : undefined;
    const syncedTo = data?.syncedTo;
    return {
      ...event,
      channel,
      id,
      name,
      syncedTo,
      cues,
    };
  }

  protected updatePlaying(
    channel: string,
    update: AudioUpdate,
    data: AudioData
  ) {
    if (update.control === "stop") {
      delete this._channelsPlaying[channel]?.[data.id];
    } else {
      this._channelsPlaying[channel] ??= {};
      const playing = this._channelsPlaying[channel]!;
      playing[data.id] ??= data;
    }
  }

  protected saveState(channel: string, update: AudioUpdate) {
    const id = update.id;
    this._state.channels ??= {};
    this._state.channels[channel] ??= {};
    if (id) {
      // We are targeting an audio player
      if (update.control === "stop") {
        delete this._state?.channels?.[channel]?.looping?.[id];
      } else {
        this._state.channels[channel]!.looping ??= {};
        this._state.channels[channel]!.looping![id] ??= {
          control: update.control,
          channel,
          id: update.id,
          name: update.name,
        };
        const restoreState = this._state.channels[channel]!.looping![id]!;
        if (update.control === "play") {
          restoreState.control = update.control;
        }
        if (update.after != null) {
          restoreState.after = update.after;
        }
        if (update.with != null) {
          restoreState.with = update.with;
        }
        if (update.over != null) {
          restoreState.over = update.over;
        }
        if (update.gain != null) {
          restoreState.gain = update.gain;
        }
        if (update.loop != null) {
          restoreState.loop = update.loop;
        }
        if (update.now != null) {
          restoreState.now = update.now;
        }
        if (update.syncedTo != null) {
          restoreState.syncedTo = update.syncedTo;
        }
      }
    } else {
      // We are targeting an audio channel
      if (update.control === "stop") {
        delete this._state?.channels?.[channel]?.looping;
      } else if (update.control === "play") {
        // `play` cannot be used on channel
      } else if (update.control === "fade") {
        if (update.gain != null) {
          Object.values(this._state.channels[channel]!.looping || {}).forEach(
            (restoreState) => {
              if (update.control === "play") {
                restoreState.control = update.control;
              }
              if (update.after != null) {
                restoreState.after = update.after;
              }
              if (update.with != null) {
                restoreState.with = update.with;
              }
              if (update.over != null) {
                restoreState.over = update.over;
              }
              if (update.gain != null) {
                restoreState.gain = update.gain;
              }
              if (update.loop != null) {
                restoreState.loop = update.loop;
              }
              if (update.now != null) {
                restoreState.now = update.now;
              }
              if (update.syncedTo != null) {
                restoreState.syncedTo = update.syncedTo;
              }
            }
          );
        }
      }
    }
  }

  queue(channel: string, sequence: AudioEvent[], autoTrigger = false): number {
    const channelDef: Channel = this._context["channel"]?.[channel];
    const audioToLoad = new Set<AudioData>();
    const updates: AudioUpdate[] = [];
    sequence.forEach((event) => {
      if (event.assets && event.assets.length > 0) {
        this.getAllAudioData(event.assets).forEach((d) => {
          d.loop ??= channelDef.loop;
          audioToLoad.add(d);
          const update = this.process(channel, event, d);
          this.updatePlaying(channel, update, d);
          this.saveState(channel, update);
          updates.push(update);
        });
      } else {
        if (event.control === "stop") {
          const playing = this._channelsPlaying[channel];
          if (playing) {
            Object.values(playing).forEach((d) => {
              audioToLoad.add(d);
              const update = this.process(channel, event, d);
              this.updatePlaying(channel, update, d);
              this.saveState(channel, update);
              updates.push(update);
            });
          }
        } else if (event.control === "fade") {
          const playing = this._channelsPlaying[channel];
          if (playing) {
            Object.values(playing).forEach((d) => {
              audioToLoad.add(d);
              const update = this.process(channel, event, d);
              this.updatePlaying(channel, update, d);
              this.saveState(channel, update);
              updates.push(update);
            });
          }
        }
      }
    });
    const id = this.nextTriggerId();
    const trigger = () => {
      this.update(...updates);
    };
    this.loadAllAudio(Array.from(audioToLoad)).then(() => {
      this.enableTrigger(id, trigger);
      if (autoTrigger) {
        trigger();
      }
    });
    return id;
  }

  stopChannel(channel: string, after?: number, over?: number, now?: boolean) {
    return this.queue(
      channel,
      [
        {
          control: "stop",
          after,
          over,
          now,
        },
      ],
      true
    );
  }

  fadeChannel(
    channel: string,
    to: number,
    after?: number,
    over?: number,
    now?: boolean
  ) {
    return this.queue(
      channel,
      [
        {
          control: "fade",
          gain: to,
          after,
          over,
          now,
        },
      ],
      true
    );
  }
}
