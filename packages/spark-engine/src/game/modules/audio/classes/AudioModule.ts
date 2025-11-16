import { Module } from "../../../core/classes/Module";
import { AudioInstruction } from "../../../core/types/Instruction";
import {
  AudioBuiltins,
  audioBuiltinDefinitions,
} from "../audioBuiltinDefinitions";
import { AudioPlayerUpdate } from "../types/AudioPlayerUpdate";
import { ChannelState } from "../types/ChannelState";
import { LoadAudioPlayerParams } from "../types/LoadAudioPlayerParams";
import { Synth } from "../types/Synth";
import { parseTones } from "../utils/parseTones";
import { ConfigureAudioMixerMessage } from "./messages/ConfigureAudioMixerMessage";
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
  protected _channelsCurrentlyPlaying: Map<
    string,
    Map<string, LoadAudioPlayerParams>
  > = new Map();

  protected _outputLatency = 0;
  get outputLatency() {
    return this._outputLatency;
  }

  override getBuiltins() {
    return audioBuiltinDefinitions();
  }

  override getStored() {
    return [];
  }

  override onReset() {
    this._channelsCurrentlyPlaying = new Map();
  }

  override async onRestore() {
    if (this.context.mixer) {
      // TODO: retrieve saved mixer gain from preferences instead
      for (const [k, v] of Object.entries(this.context.mixer)) {
        this.configure(k, v.gain);
      }
    }
    if (!this.context.system.previewing) {
      if (this._state.channels) {
        await Promise.all(
          Object.keys(this._state.channels).map((channel) =>
            this.restoreChannel(channel)
          )
        );
      }
    }
  }

  protected async restoreChannel(channel: string) {
    const updates: AudioPlayerUpdate[] = [];
    const audioToLoad: LoadAudioPlayerParams[] = [];
    const channelState = this._state.channels?.[channel];
    if (channelState?.looping) {
      for (const state of channelState.looping) {
        if (state.key) {
          const dataArray = this.getAudioData(channel, state.key);
          for (const d of dataArray) {
            if (state.syncedTo) {
              const cues = this.getCues(state.syncedTo);
              if (cues) {
                d.cues = cues;
              }
            }
            audioToLoad.push(d);
          }
        }
        const update: AudioPlayerUpdate = {
          control: "start",
          key: state.key,
          to: state.to,
          loop: true,
          now: true,
        };
        updates.push(update);
      }
    }
    await this.loadAllAudio(audioToLoad);
    this.update(channel, updates);
  }

  protected update(channel: string, updates: AudioPlayerUpdate[]) {
    this.emit(
      UpdateAudioPlayersMessage.type.request({
        channel,
        updates,
      })
    );
  }

  protected async loadAudio(data: LoadAudioPlayerParams): Promise<void> {
    await new Promise<void>(async (resolve) => {
      const result = await this.emit(LoadAudioPlayerMessage.type.request(data));
      if (result?.outputLatency != null) {
        this._outputLatency = result?.outputLatency;
      }
      resolve();
    });
  }

  protected async loadAllAudio(
    dataArray: LoadAudioPlayerParams[]
  ): Promise<void> {
    await Promise.all(dataArray.map((d) => this.loadAudio(d)));
  }

  protected getCues(syncedTo: string) {
    const [syncedToType, syncedToName] = syncedTo?.split(".") || [];
    if (syncedToType && syncedToName) {
      return (
        this.context?.[syncedToType as keyof AudioBuiltins]?.[
          syncedToName
        ] as any
      )?.cues;
    }
    return undefined;
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
    if (d.name) {
      const resolvedAsset =
        this.context?.[d.type as "audio" | "synth"]?.[d.name];
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
        if (
          "loop" in resolvedAsset &&
          typeof resolvedAsset.loop === "boolean"
        ) {
          d.loop = resolvedAsset.loop;
        }
        if ("loop_start" in resolvedAsset) {
          d.loopStart = resolvedAsset.loop_start;
        }
        if ("loop_end" in resolvedAsset) {
          d.loopEnd = resolvedAsset.loop_end;
        }
        if ("shape" in resolvedAsset) {
          d.synth = resolvedAsset as Synth;
        }
        d.tones = this.parseTones(d.key);
      }
    }
    return d;
  }

  protected getAudioData(
    channel: string,
    key: string
  ): LoadAudioPlayerParams[] {
    const indexOfFirstSeparator = key.indexOf("~");
    const asset =
      indexOfFirstSeparator >= 0 ? key.slice(0, indexOfFirstSeparator) : key;
    const suffix =
      indexOfFirstSeparator >= 0 ? key.slice(indexOfFirstSeparator) : "";
    const [type, name] = asset.includes(".") ? asset.split(".") : ["", asset];
    if (!name) {
      return [];
    }
    const compiled = type
      ? this.context?.[type as "audio" | "synth"]?.[name]
      : this.context?.audio?.[name] ||
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
      for (const asset of compiled) {
        const d = this.getData(channel, asset, suffix);
        if (d) {
          dataArray.push(d);
        }
      }
      return dataArray;
    }
    if ("assets" in compiled && Array.isArray(compiled.assets)) {
      const dataArray: LoadAudioPlayerParams[] = [];
      for (const asset of compiled.assets) {
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
      }
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
    data?: LoadAudioPlayerParams
  ): AudioPlayerUpdate {
    const update: AudioPlayerUpdate = {
      control: event.control as AudioPlayerUpdate["control"],
      after: event.after,
      over: event.over,
      to: event.to,
      loop: event.loop,
      now: event.now,
    };
    if (data?.key != null) {
      update.key = data.key;
    }
    if (update.control === "start") {
      update.loop ??= this.context?.channel?.[channel]?.loop || data?.loop;
    }
    return update;
  }

  protected setCurrentlyPlaying(
    channel: string,
    update: AudioPlayerUpdate,
    data?: LoadAudioPlayerParams
  ) {
    if (update.control === "stop") {
      if (data?.key) {
        const playing = this._channelsCurrentlyPlaying.get(channel);
        playing?.delete(data.key);
      } else {
        this._channelsCurrentlyPlaying.delete(channel);
      }
    } else {
      if (data?.key) {
        const playing =
          this._channelsCurrentlyPlaying.get(channel) ?? new Map();
        this._channelsCurrentlyPlaying.set(channel, playing);
        playing.set(data.key, data);
      }
    }
  }

  protected saveChannelState(
    channel: string,
    update: AudioPlayerUpdate,
    data?: LoadAudioPlayerParams
  ) {
    if (
      update.control === "stop" ||
      update.control === "await" ||
      (update.control === "start" && !update.loop)
    ) {
      if (data?.key) {
        const existingUpdateIndex = this._state.channels?.[
          channel
        ]?.looping?.findIndex((s) => s.key === data.key);
        if (existingUpdateIndex != null && existingUpdateIndex >= 0) {
          this._state.channels?.[channel]?.looping?.splice(
            existingUpdateIndex,
            1
          );
        }
      } else {
        delete this._state.channels?.[channel]?.looping;
      }
    } else {
      if (data?.key) {
        const existingUpdate = this._state.channels?.[channel]?.looping?.find(
          (s) => s.key === data.key
        );
        if (existingUpdate) {
          if (data.syncedTo != null) {
            existingUpdate.syncedTo ??= data.syncedTo;
          }
          if (update.to != null) {
            existingUpdate.to = update.to;
          }
        } else if (update.control === "start") {
          this._state.channels ??= {};
          this._state.channels[channel] ??= {};
          this._state.channels[channel].looping ??= [];
          this._state.channels[channel].looping.push({
            key: data.key,
            syncedTo: data.syncedTo,
            to: update.to,
          });
        }
      } else {
        const playing = this._channelsCurrentlyPlaying.get(channel);
        if (playing) {
          for (const d of playing.values()) {
            this.saveChannelState(channel, update, d);
          }
        }
      }
    }
  }

  protected configure(mixer: string, gain: number) {
    this.emit(
      ConfigureAudioMixerMessage.type.request({
        mixer,
        gain,
      })
    );
  }

  schedule(
    channel: string,
    sequence: AudioInstruction[],
    autoTrigger = false
  ): number {
    const audioToLoad = new Set<LoadAudioPlayerParams>();
    const updates: AudioPlayerUpdate[] = [];
    for (const e of sequence) {
      const event = { ...e };
      if (event.control === "queue") {
        // 'queue' is equivalent to calling 'await' on a channel,
        // and then calling 'start' on the new audio
        const awaitUpdate: AudioPlayerUpdate = {
          control: "await",
          after: event.after,
          over: event.over,
          loop: false,
          now: event.now,
        };
        this.setCurrentlyPlaying(channel, awaitUpdate);
        this.saveChannelState(channel, awaitUpdate);
        updates.push(awaitUpdate);
        event.control = "start";
      }
      if (event.control === "play") {
        const playBehavior =
          this.context?.channel?.[channel]?.play_behavior || "replace";
        if (playBehavior === "replace") {
          // When 'play_behavior' is "replace",
          // 'play' is equivalent to calling 'stop' on all audio playing on a channel,
          // and then calling 'start' on the new audio
          const stopUpdate: AudioPlayerUpdate = {
            control: "stop",
            after: event.after,
            over: event.over,
            now: event.now,
          };
          const playing = this._channelsCurrentlyPlaying.get(channel);
          if (playing) {
            for (const d of playing.values()) {
              this.setCurrentlyPlaying(channel, stopUpdate, d);
              this.saveChannelState(channel, stopUpdate, d);
              updates.push(stopUpdate);
            }
          }
        }
        event.control = "start";
      }
      if (event.assets && event.assets.length > 0) {
        for (const d of this.getAllAudioData(channel, event.assets)) {
          audioToLoad.add(d);
          const update = this.process(channel, event, d);
          this.setCurrentlyPlaying(channel, update, d);
          this.saveChannelState(channel, update, d);
          updates.push(update);
        }
      } else {
        const update = this.process(channel, event);
        const playing = this._channelsCurrentlyPlaying.get(channel);
        if (playing) {
          for (const d of playing.values()) {
            this.setCurrentlyPlaying(channel, update, d);
            this.saveChannelState(channel, update, d);
            updates.push(update);
          }
        }
      }
    }
    const id = this.nextTriggerId();
    if (this.context.system.simulating) {
      this.enableTrigger(id);
      return id;
    }
    const trigger = () => {
      this.update(channel, updates);
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
    return this.schedule(
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
    return this.schedule(
      channel,
      [
        {
          control: "fade",
          to: to,
          after,
          over,
          now,
        },
      ],
      true
    );
  }
}
