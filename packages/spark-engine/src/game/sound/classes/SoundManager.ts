import { GameEvent1, GameEvent2, GameEvent3, GameEvent4 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { MIDI_STATUS_DATA } from "../constants/MIDI_STATUS_DATA";
import { MIDI_STATUS_SYSTEM } from "../constants/MIDI_STATUS_TYPE";
import { Midi } from "../types/Midi";
import { MidiEvent } from "../types/MidiEvent";
import { MidiTrackState } from "../types/MidiTrackState";
import { Sound } from "../types/Sound";
import { SoundPlaybackControl } from "../types/SoundPlaybackControl";
import { SynthConfig } from "../types/Synth";
import { createOrResetMidiTrackState } from "../utils/createOrResetMidiTrackState";

export interface SoundEvents extends Record<string, GameEvent> {
  onLoad: GameEvent1<Sound>;
  onStart: GameEvent3<Sound[], number | undefined, number | undefined>;
  onStop: GameEvent4<
    Sound[],
    number | undefined,
    number | undefined,
    boolean | undefined
  >;
  onFade: GameEvent4<
    Sound[],
    number | undefined,
    number | undefined,
    boolean | undefined
  >;
  onUpdate: GameEvent1<number>;
  onMidiEvent: GameEvent2<string, MidiEvent>;
}

export interface SoundConfig {
  synths: Record<string, SynthConfig>;
  midis: Map<string, Midi>;
  sounds: Map<string, Sound>;
}

export interface SoundState {
  playbackStates: Record<string, SoundPlaybackControl>;
  channels: Record<string, string[]>;
  groups: Record<string, string[]>;
}

export class SoundManager extends Manager<
  SoundEvents,
  SoundConfig,
  SoundState
> {
  protected _midiStates: Record<string, MidiTrackState> = {};

  protected _onReadyCallbacks: Map<string, undefined | (() => void)[]> =
    new Map();

  protected _loading = new Set<string>();

  protected _ready = new Map<string, Sound | Midi>();

  constructor(config?: Partial<SoundConfig>, state?: Partial<SoundState>) {
    const initialEvents: SoundEvents = {
      onLoad: new GameEvent1<Sound>(),
      onStart: new GameEvent3<Sound[], number, number>(),
      onStop: new GameEvent4<Sound[], number, number, boolean>(),
      onFade: new GameEvent4<Sound[], number, number, boolean>(),
      onUpdate: new GameEvent1<number>(),
      onMidiEvent: new GameEvent2<string, MidiEvent>(),
    };
    const initialConfig: SoundConfig = {
      synths: {},
      midis: new Map(),
      sounds: new Map(),
      ...(config || {}),
    };
    const initialState: SoundState = {
      playbackStates: {},
      channels: {},
      groups: {},
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  protected getOrCreatePlaybackState(id: string) {
    this._state.playbackStates[id] ??= {
      elapsedMS: -1,
      latestEvent: -1,
      started: false,
      paused: false,
      muted: false,
      volume: 1,
    };
    return this._state.playbackStates[id]!;
  }

  protected deletePlaybackState(id: string) {
    delete this._state.playbackStates[id];
  }

  setChannel(id: string, layer: string): SoundPlaybackControl {
    const controlState = this.getOrCreatePlaybackState(id);
    if (layer) {
      controlState.channel = layer;
      this._state.channels[layer] ??= [];
      this._state.channels[layer]!.push(id);
    }
    return controlState;
  }

  setGroup(id: string, group: string): SoundPlaybackControl {
    const controlState = this.getOrCreatePlaybackState(id);
    if (group) {
      controlState.group = group;
      this._state.groups[group] ??= [];
      this._state.groups[group]!.push(id);
    }
    return controlState;
  }

  removeFromLayer(id: string, layer: string) {
    const layerState = this._state.channels[layer];
    if (layerState) {
      this._state.channels[layer] = layerState.filter((x) => x != id) ?? [];
    }
  }

  removeFromGroup(id: string, group: string) {
    const groupState = this._state.groups[group];
    if (groupState) {
      this._state.groups[group] = groupState.filter((x) => x != id) ?? [];
    }
  }

  protected _load(sound: Sound, callback?: () => void) {
    const id = sound.id;
    if (this._ready.has(id)) {
      callback?.();
      return;
    }
    if (callback) {
      if (!this._onReadyCallbacks.get(id)) {
        this._onReadyCallbacks.set(id, []);
      }
      const listeners = this._onReadyCallbacks.get(id);
      listeners?.push(callback);
    }
    if (this._loading.has(id)) {
      return;
    }
    this._loading.add(id);
    this._config.sounds.set(id, sound);
    this._events.onLoad.dispatch(sound);
  }

  async load(sound: Sound): Promise<void> {
    return new Promise((resolve) => {
      this._load(sound, resolve);
    });
  }

  notifyReady(id: string) {
    const sound = this._config.sounds.get(id);
    const midi = this._config.midis.get(id);
    const audio = sound || midi;
    if (audio) {
      this._ready.set(id, audio);
      this._loading.delete(id);
    }
    const onReadyCallbacks = this._onReadyCallbacks.get(id);
    if (onReadyCallbacks) {
      onReadyCallbacks.forEach((callback) => callback?.());
    }
  }

  async loadAll(sounds: Sound[]) {
    return Promise.all(sounds.map((sound) => this.load(sound)));
  }

  protected async startSounds(
    sounds: Sound[],
    channel?: string,
    group?: string,
    after?: number,
    over?: number,
    onReady?: () => void
  ) {
    await this.loadAll(sounds);
    sounds.forEach((sound) => {
      if (channel) {
        this.setChannel(sound.id, channel);
      }
      if (group) {
        this.setGroup(sound.id, group);
      }
    });
    this._events.onStart.dispatch(sounds, after, over);
    onReady?.();
  }

  async startAll(
    sounds: Sound[],
    channel: string,
    group: string,
    after?: number,
    over?: number,
    onReady?: () => void
  ) {
    return this.startSounds(sounds, channel, group, after, over, onReady);
  }

  async start(
    sound: Sound,
    channel: string,
    after?: number,
    over?: number,
    onReady?: () => void
  ) {
    return this.startSounds([sound], channel, undefined, after, over, onReady);
  }

  protected async stopSounds(
    sounds: Sound[],
    channel?: string,
    group?: string,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    await this.loadAll(sounds);
    sounds.forEach((sound) => {
      if (channel) {
        this.removeFromLayer(sound.id, channel);
      }
      if (group) {
        this.removeFromGroup(sound.id, group);
      }
      this.deletePlaybackState(sound.id);
    });
    this._events.onStop.dispatch(sounds, after, over, scheduled);
    onReady?.();
  }

  async stopAll(
    sounds: Sound[],
    channel: string,
    group: string,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.stopSounds(
      sounds,
      channel,
      group,
      after,
      over,
      scheduled,
      onReady
    );
  }

  async stop(
    sound: Sound,
    channel: string,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.stopSounds(
      [sound],
      channel,
      undefined,
      after,
      over,
      scheduled,
      onReady
    );
  }

  async stopLayer(
    channel: string,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    const ids = this._state.channels[channel];
    if (!ids) {
      return;
    }
    const sounds = ids.map((id) => this._config.sounds.get(id)!);
    return this.stopSounds(
      sounds,
      channel,
      undefined,
      after,
      over,
      scheduled,
      onReady
    );
  }

  protected async fadeSounds(
    sounds: Sound[],
    channel?: string,
    group?: string,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    sounds.forEach((sound) => {
      if (channel) {
        this.setChannel(sound.id, channel);
      }
      if (group) {
        this.setGroup(sound.id, group);
      }
      const controlState = this.getOrCreatePlaybackState(sound.id);
      controlState.muted = false;
    });
    await this.loadAll(sounds);
    this._events.onFade.dispatch(sounds, after, over, scheduled);
    onReady?.();
  }

  async fadeAll(
    sounds: Sound[],
    channel: string,
    group: string,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.fadeSounds(
      sounds,
      channel,
      group,
      after,
      over,
      scheduled,
      onReady
    );
  }

  async fade(
    sound: Sound,
    channel: string,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.fadeSounds(
      [sound],
      channel,
      undefined,
      after,
      over,
      scheduled,
      onReady
    );
  }

  async fadeLayer(
    layer: string,
    volume?: number,
    after?: number,
    over?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    const ids = this._state.channels[layer];
    if (!ids) {
      return;
    }
    const sounds = ids.map((id) => {
      const sound = { ...this._config.sounds.get(id)! };
      sound.volume = volume;
      return sound;
    });
    return this.fadeSounds(
      sounds,
      layer,
      undefined,
      after,
      over,
      scheduled,
      onReady
    );
  }

  protected updateMidi(deltaMS: number, id: string, midi: Midi) {
    const controlState = this._state.playbackStates[id];
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
    const midiTrackState = createOrResetMidiTrackState(this._midiStates[id]);
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
          this._events.onMidiEvent.dispatch(id, event);
          controlState.latestEvent = index;
        }
      });
    });
  }

  protected updateSound(deltaMS: number, id: string) {
    const controlState = this._state.playbackStates[id];
    if (!controlState) {
      return;
    }
    if (controlState.paused) {
      return;
    }
    if (controlState.started) {
      controlState.elapsedMS += deltaMS;
    }
  }

  override update(deltaMS: number) {
    // Update sound playback
    this._ready.forEach((audio, id) => {
      if ("tpq" in audio) {
        this.updateMidi(deltaMS, id, audio);
      } else {
        this.updateSound(deltaMS, id);
      }
    });

    // Notify update
    this._events.onUpdate.dispatch(deltaMS);
  }
}
