import { GameEvent1, GameEvent2 } from "../../../core";
import { GameEvent } from "../../../core/classes/GameEvent";
import { Manager } from "../../../core/classes/Manager";
import { GameContext } from "../../../core/types/GameContext";
import { AudioEvent } from "../../../core/types/SequenceEvent";
import { MIDI_STATUS_DATA } from "../constants/MIDI_STATUS_DATA";
import { MIDI_STATUS_SYSTEM } from "../constants/MIDI_STATUS_TYPE";
import { Channel } from "../specs/Channel";
import { Synth } from "../specs/Synth";
import { AudioData } from "../types/AudioData";
import { AudioUpdate } from "../types/AudioUpdate";
import { ChannelState } from "../types/ChannelState";
import { Midi } from "../types/Midi";
import { MidiEvent } from "../types/MidiEvent";
import { MidiTrackState } from "../types/MidiTrackState";
import { SoundPlaybackControl } from "../types/SoundPlaybackControl";
import { createOrResetMidiTrackState } from "../utils/createOrResetMidiTrackState";
import { parseTones } from "../utils/parseTones";

export interface AudioEvents extends Record<string, GameEvent> {
  onLoad: GameEvent1<AudioData>;
  onUpdate: GameEvent1<AudioUpdate[]>;
  onMidiEvent: GameEvent2<string, MidiEvent>;
}

export interface AudioConfig {}

export interface AudioState {
  channels?: Record<string, ChannelState>;
}

export class AudioManager extends Manager<
  AudioEvents,
  AudioConfig,
  AudioState
> {
  protected _midiPlayback: Record<string, SoundPlaybackControl> = {};

  protected _midiTracks: Record<string, MidiTrackState> = {};

  protected _onReady: Map<string, undefined | (() => void)[]> = new Map();

  protected _ready = new Set<string>();

  protected _updates: AudioUpdate[] = [];

  protected _playing: Record<string, Map<string, AudioUpdate>> = {};

  constructor(
    context: GameContext,
    config?: Partial<AudioConfig>,
    state?: Partial<AudioState>
  ) {
    const initialEvents: AudioEvents = {
      onLoad: new GameEvent1<AudioData>(),
      onUpdate: new GameEvent1<AudioUpdate[]>(),
      onMidiEvent: new GameEvent2<string, MidiEvent>(),
    };
    const initialConfig: AudioConfig = {
      audioContext: {
        baseLatency: 0,
        outputLatency: 0,
        currentTime: 0,
        sampleRate: 44100,
      },
      ...(config || {}),
    };
    super(context, initialEvents, initialConfig, state || {});
    this.onRestore();
  }

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
      await this.loadAll(Array.from(audioToLoad));
      this._updates.push(...updates);
    }
  }

  override onUpdate() {
    if (this._updates.length > 0) {
      // Flush updates that should be handled this frame
      this._events.onUpdate.dispatch([
        ...this._updates.map((u) => ({
          ...u,
          volume: u.volume * this.getVolumeMultiplier(u.channel, u.name),
        })),
      ]);
      this._updates.length = 0;
    }
    return true;
  }

  notifyReady(id: string) {
    this._ready.add(id);
    const onReadyCallbacks = this._onReady.get(id);
    if (onReadyCallbacks) {
      onReadyCallbacks.forEach((callback) => callback?.());
    }
  }

  protected _load(data: AudioData, callback?: () => void) {
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
    if (!this._context.game?.simulating) {
      this._events.onLoad.dispatch(data);
    }
  }

  async load(data: AudioData): Promise<void> {
    await new Promise<void>((resolve) => {
      this._load(data, resolve);
    });
  }

  async loadAll(dataArray: AudioData[]): Promise<void> {
    await Promise.all(dataArray.map((d) => this.load(d)));
  }

  protected updateMidi(deltaMS: number, id: string, midi: Midi) {
    const controlState = this._midiPlayback?.[id];
    if (!controlState) {
      return;
    }
    if (controlState.paused) {
      return;
    }
    if (controlState.started) {
      controlState.elapsedMS += deltaMS;
    }
    // For performance reasons, we reset all existing states
    // rather than creating new state objects every tick
    const midiTrackState = createOrResetMidiTrackState(this._midiTracks[id]);
    midi.tracks.forEach((track) => {
      track.forEach((event, index) => {
        const ticks = event.ticks ?? 0;
        if (
          event.statusType === MIDI_STATUS_SYSTEM.system_meta &&
          event.statusData === MIDI_STATUS_DATA.system_meta_tempo
        ) {
          midiTrackState.mpq = event.tempoMPQ;
        }
        const secondsPerQuarterNote = midiTrackState.mpq / 1000000;
        const quarterNotesPerTick = 1 / midi.tpq;
        const quarterNotes = ticks * quarterNotesPerTick;
        const time = quarterNotes * secondsPerQuarterNote;
        const timeMS = time * 1000;
        if (
          index > controlState.latestEvent &&
          controlState.elapsedMS >= timeMS
        ) {
          if (!this._context.game?.simulating) {
            this._events.onMidiEvent.dispatch(id, event);
          }
          controlState.latestEvent = index;
        }
      });
    });
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
    this.loadAll(Array.from(audioToLoad)).then(() => {
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
