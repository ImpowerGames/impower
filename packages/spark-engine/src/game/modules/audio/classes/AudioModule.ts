import { Module } from "../../../core/classes/Module";
import { AudioInstruction } from "../../../core/types/Instruction";
import { AudioBuiltins, audioBuiltins } from "../audioBuiltins";
import { AudioMixerUpdate } from "../types/AudioMixerUpdate";
import { AudioPlayerUpdate } from "../types/AudioPlayerUpdate";
import { ChannelState } from "../types/ChannelState";
import { LoadAudioPlayerParams } from "../types/LoadAudioPlayerParams";
import { Synth } from "../types/Synth";
import { parseTones } from "../utils/parseTones";
import { LoadAudioMixerMessage } from "./messages/LoadAudioMixerMessage";
import {
  LoadAudioPlayerMessage,
  LoadAudioPlayerMessageMap,
} from "./messages/LoadAudioPlayerMessage";
import {
  UpdateAudioPlayersMessage,
  UpdateAudioPlayersMessageMap,
} from "./messages/UpdateAudioPlayersMessage";

export interface AudioConfig {}

export interface AudioState {
  channels?: Record<string, ChannelState>;
}

export type AudioMessageMap = LoadAudioPlayerMessageMap &
  UpdateAudioPlayersMessageMap;

export class AudioModule extends Module<
  AudioState,
  AudioMessageMap,
  AudioBuiltins
> {
  protected _channelsPlaying: Record<
    string,
    Record<string, LoadAudioPlayerParams>
  > = {};

  protected _playerUpdates: AudioPlayerUpdate[] = [];

  protected _mixerUpdates: AudioMixerUpdate[] = [];

  protected _outputLatency = 0;
  get outputLatency() {
    return this._outputLatency;
  }

  override getBuiltins() {
    return audioBuiltins();
  }

  override getStored() {
    return [];
  }

  override async onRestore() {
    this._playerUpdates.length = 0;
    this._mixerUpdates.length = 0;
    Object.entries(this.context?.mixer || {}).forEach(([key, mixer]) => {
      if (typeof mixer === "object") {
        this.emit(LoadAudioMixerMessage.type.request({ key, ...mixer }));
      }
    });
    if (this._state.channels) {
      const audioToLoad = new Set<LoadAudioPlayerParams>();
      const updates: AudioPlayerUpdate[] = [];
      Object.keys(this._state.channels).forEach((channel) => {
        const channelState = this._state.channels?.[channel];
        if (channelState?.looping) {
          Object.entries(channelState.looping).forEach(([key, update]) => {
            const dataArray = this.getAudioData(channel, key);
            if (dataArray) {
              dataArray.forEach((d) => {
                audioToLoad.add(d);
                // populate update with latest matching cues
                const syncedTo = update.syncedTo;
                if (syncedTo) {
                  const [syncedToType, syncedToName] =
                    syncedTo?.split(".") || [];
                  if (syncedToType && syncedToName) {
                    update.cues = (
                      this.context?.[syncedToType as keyof AudioBuiltins]?.[
                        syncedToName
                      ] as any
                    )?.cues;
                  }
                }
                updates.push(update);
              });
            }
          });
        }
      });
      await this.loadAllAudio(Array.from(audioToLoad));
      this.queueUpdates(...updates);
    }
  }

  override onUpdate() {
    this.updateNow();
    return true;
  }

  updateNow() {
    if (this._playerUpdates.length > 0) {
      // Flush updates that should be handled this frame
      this.emit(
        UpdateAudioPlayersMessage.type.request({
          updates: [...this._playerUpdates],
        })
      );
      this._playerUpdates.length = 0;
    }
  }

  getMixer(channel: string | undefined): string {
    return (
      this.context?.channel?.[channel || "default"]?.mixer ||
      channel ||
      "default"
    );
  }

  queueUpdates(...updates: AudioPlayerUpdate[]) {
    updates.forEach((u) => {
      this._playerUpdates.push({
        ...u,
        mixer: this.getMixer(u.channel),
      });
    });
  }

  async loadAudio(data: LoadAudioPlayerParams): Promise<void> {
    await new Promise<void>(async (resolve) => {
      const msg = await this.emit(LoadAudioPlayerMessage.type.request(data));
      if (LoadAudioPlayerMessage.type.isResponse(msg)) {
        if (msg.result?.outputLatency != null) {
          this._outputLatency = msg.result?.outputLatency;
        }
        resolve();
      }
    });
  }

  async loadAllAudio(dataArray: LoadAudioPlayerParams[]): Promise<void> {
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
    const channelMixerName = this.context?.channel?.[channel]?.mixer || "";
    return (
      this.getModulatedVolume(this.context?.mixer?.["main"]) *
      this.getModulatedVolume(this.context?.mixer?.[channelMixerName])
    );
  }

  protected getData(
    channel: string,
    asset: unknown,
    suffix: string
  ): LoadAudioPlayerParams | null {
    if (!asset) {
      return null;
    }
    const d: LoadAudioPlayerParams = {
      channel,
      mixer: this.getMixer(channel),
      key: "",
      type: "audio",
      name: "",
      volume: 1,
    };
    if (typeof asset === "string") {
      d.type = "audio";
      d.name = asset;
    } else if (typeof asset === "object") {
      if ("$type" in asset && typeof asset.$type === "string") {
        if (asset.$type) {
          d.type = asset.$type;
        }
      }
      if ("$name" in asset && typeof asset.$name === "string") {
        if (asset.$name) {
          d.name = asset.$name;
        }
      }
    }
    d.key = d.type + "." + d.name + suffix;
    const resolvedAsset = this.context?.[d.type as "audio" | "synth"]?.[d.name];
    if (resolvedAsset) {
      if ("src" in resolvedAsset && typeof resolvedAsset.src === "string") {
        d.src = resolvedAsset.src;
      }
      if (
        "volume" in resolvedAsset &&
        typeof resolvedAsset.volume === "number"
      ) {
        d.volume = resolvedAsset.volume;
      }
      if (
        "cues" in resolvedAsset &&
        Array.isArray(resolvedAsset.cues) &&
        resolvedAsset.cues.length > 0
      ) {
        d.syncedTo = `${d.type}.${d.name}`;
        d.cues = resolvedAsset.cues;
      }
      if ("shape" in resolvedAsset) {
        d.synth = resolvedAsset as Synth;
      }
      d.tones = this.parseTones(d.key);
    }
    return d;
  }

  protected getAudioData(
    channel: string,
    key: string
  ): LoadAudioPlayerParams[] {
    const indexOfFirstSeparator = key.indexOf("~");
    const name =
      indexOfFirstSeparator >= 0 ? key.slice(0, indexOfFirstSeparator) : key;
    const suffix =
      indexOfFirstSeparator >= 0 ? key.slice(indexOfFirstSeparator) : "";
    if (!name) {
      return [];
    }
    const compiled =
      this.context?.audio?.[name] ||
      this.context?.layered_audio?.[name] ||
      this.context?.synth?.[name];
    if (!compiled) {
      return [];
    }
    if (typeof compiled !== "object") {
      return [];
    }
    if (Array.isArray(compiled)) {
      const dataArray: LoadAudioPlayerParams[] = [];
      compiled.forEach((asset) => {
        const d = this.getData(channel, asset, suffix);
        if (d) {
          dataArray.push(d);
        }
      });
      return dataArray;
    }
    if ("assets" in compiled && Array.isArray(compiled.assets)) {
      const dataArray: LoadAudioPlayerParams[] = [];
      compiled.assets.forEach((asset: unknown) => {
        const d = this.getData(channel, asset, suffix);
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
    const d = this.getData(channel, compiled, suffix);
    if (d) {
      return [d];
    }
    return [];
  }

  protected getAllAudioData(
    channel: string,
    keys: string[]
  ): LoadAudioPlayerParams[] {
    return keys.flatMap((n) => this.getAudioData(channel, n));
  }

  protected parseTones(key: string) {
    const indexOfFirstSeparator = key.indexOf("~");
    const suffix =
      indexOfFirstSeparator >= 0 ? key.slice(indexOfFirstSeparator + 1) : "";
    if (suffix) {
      return parseTones(suffix, "~");
    }
    return [];
  }

  protected process(
    channel: string,
    event: AudioInstruction,
    data: LoadAudioPlayerParams
  ): AudioPlayerUpdate {
    const key = data?.key;
    const name = data?.name;
    const cues = data?.cues && data.cues?.length > 0 ? data.cues : undefined;
    const syncedTo = data?.syncedTo;
    return {
      ...event,
      channel,
      key,
      name,
      syncedTo,
      cues,
    };
  }

  protected updatePlaying(
    channel: string,
    update: AudioPlayerUpdate,
    data: LoadAudioPlayerParams
  ) {
    if (update.control === "stop") {
      delete this._channelsPlaying[channel]?.[data.key];
    } else {
      this._channelsPlaying[channel] ??= {};
      const playing = this._channelsPlaying[channel]!;
      playing[data.key] ??= data;
    }
  }

  protected saveState(channel: string, update: AudioPlayerUpdate) {
    const key = update.key;
    this._state.channels ??= {};
    this._state.channels[channel] ??= {};
    if (key) {
      // We are targeting an audio player
      if (update.control === "stop") {
        delete this._state?.channels?.[channel]?.looping?.[key];
      } else {
        this._state.channels[channel]!.looping ??= {};
        this._state.channels[channel]!.looping![key] ??= {
          control: update.control,
          channel,
          key: update.key,
          name: update.name,
        };
        const restoreState = this._state.channels[channel]!.looping![key]!;
        if (update.control === "start") {
          restoreState.control = update.control;
        }
        if (update.after != null) {
          restoreState.after = update.after;
        }
        if (update.over != null) {
          restoreState.over = update.over;
        }
        if (update.fadeto != null) {
          restoreState.fadeto = update.fadeto;
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
      } else if (update.control === "start") {
        // `start` cannot be used on channel
      } else if (update.control === "modulate") {
        if (update.fadeto != null) {
          Object.values(this._state.channels[channel]!.looping || {}).forEach(
            (restoreState) => {
              if (update.control === "start") {
                restoreState.control = update.control;
              }
              if (update.after != null) {
                restoreState.after = update.after;
              }
              if (update.over != null) {
                restoreState.over = update.over;
              }
              if (update.fadeto != null) {
                restoreState.fadeto = update.fadeto;
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

  queue(
    channel: string,
    sequence: AudioInstruction[],
    autoTrigger = false
  ): number {
    const audioToLoad = new Set<LoadAudioPlayerParams>();
    const updates: AudioPlayerUpdate[] = [];
    sequence.forEach((event) => {
      if (event.control === "play") {
        // 'play' is equivalent to calling 'stop' on all audio on the channel,
        // and then calling 'start' on the new audio
        const stopEvent: AudioInstruction = {
          control: "stop",
          after: event.after,
          over: event.over,
          now: event.now,
        };
        const playing = this._channelsPlaying[channel];
        if (playing) {
          Object.values(playing).forEach((d) => {
            const update = this.process(channel, stopEvent, d);
            this.updatePlaying(channel, update, d);
            this.saveState(channel, update);
            updates.push(update);
          });
        }
        event.control = "start";
      }
      if (event.assets && event.assets.length > 0) {
        this.getAllAudioData(channel, event.assets).forEach((d) => {
          const channelDef = this.context?.channel?.[channel];
          d.loop ??= channelDef?.loop;
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
        } else if (event.control === "modulate") {
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
      this.queueUpdates(...updates);
      this.updateNow();
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

  modulateChannel(
    channel: string,
    fadeto: number,
    after?: number,
    over?: number,
    now?: boolean
  ) {
    return this.queue(
      channel,
      [
        {
          control: "modulate",
          fadeto: fadeto,
          after,
          over,
          now,
        },
      ],
      true
    );
  }
}
