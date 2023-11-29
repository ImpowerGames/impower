import { GameEvent1, GameEvent2, GameEvent3 } from "../../core";
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
  onStart: GameEvent2<Sound[], number>;
  onStop: GameEvent3<Sound[], number, boolean>;
  onPause: GameEvent3<Sound[], number, boolean>;
  onUnpause: GameEvent3<Sound[], number, boolean>;
  onMute: GameEvent3<Sound[], number, boolean>;
  onUnmute: GameEvent3<Sound[], number, boolean>;
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
  layers: Record<string, string[]>;
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
      onStart: new GameEvent2<Sound[], number>(),
      onStop: new GameEvent3<Sound[], number, boolean>(),
      onPause: new GameEvent3<Sound[], number, boolean>(),
      onUnpause: new GameEvent3<Sound[], number, boolean>(),
      onMute: new GameEvent3<Sound[], number, boolean>(),
      onUnmute: new GameEvent3<Sound[], number, boolean>(),
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
      layers: {},
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

  setLayer(id: string, layer: string): SoundPlaybackControl {
    const controlState = this.getOrCreatePlaybackState(id);
    if (layer) {
      controlState.layer = layer;
      this._state.layers[layer] ??= [];
      this._state.layers[layer]!.push(id);
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
    const layerState = this._state.layers[layer];
    if (layerState) {
      this._state.layers[layer] = layerState.filter((x) => x != id) ?? [];
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
    layer?: string,
    group?: string,
    offset?: number,
    onReady?: () => void
  ) {
    await this.loadAll(sounds);
    sounds.forEach((sound) => {
      if (layer) {
        this.setLayer(sound.id, layer);
      }
      if (group) {
        this.setGroup(sound.id, group);
      }
    });
    this._events.onStart.dispatch(sounds, offset || 0);
    onReady?.();
  }

  async startAll(
    sounds: Sound[],
    layer: string,
    group: string,
    offset?: number,
    onReady?: () => void
  ) {
    return this.startSounds(sounds, layer, group, offset, onReady);
  }

  async start(
    sound: Sound,
    layer: string,
    offset?: number,
    onReady?: () => void
  ) {
    return this.startSounds([sound], layer, undefined, offset, onReady);
  }

  protected async stopSounds(
    sounds: Sound[],
    layer?: string,
    group?: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    await this.loadAll(sounds);
    sounds.forEach((sound) => {
      if (layer) {
        this.removeFromLayer(sound.id, layer);
      }
      if (group) {
        this.removeFromGroup(sound.id, group);
      }
      this.deletePlaybackState(sound.id);
    });
    this._events.onStop.dispatch(sounds, offset || 0, scheduled || false);
    onReady?.();
  }

  async stopAll(
    sounds: Sound[],
    layer: string,
    group: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.stopSounds(sounds, layer, group, offset, scheduled, onReady);
  }

  async stop(
    sound: Sound,
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.stopSounds(
      [sound],
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  async stopLayer(
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    const sounds = ids.map((id) => this._config.sounds.get(id)!);
    return this.stopSounds(
      sounds,
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  protected async pauseSounds(
    sounds: Sound[],
    layer?: string,
    group?: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    await this.loadAll(sounds);
    sounds.forEach((sound) => {
      if (layer) {
        this.setLayer(sound.id, layer);
      }
      if (group) {
        this.setGroup(sound.id, group);
      }
      const controlState = this.getOrCreatePlaybackState(sound.id);
      controlState.paused = true;
    });
    this._events.onPause.dispatch(sounds, offset || 0, scheduled || false);
    onReady?.();
  }

  async pauseAll(
    sounds: Sound[],
    layer: string,
    group: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.pauseSounds(sounds, layer, group, offset, scheduled, onReady);
  }

  async pause(
    sound: Sound,
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.pauseSounds(
      [sound],
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  async pauseLayer(
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    const sounds = ids.map((id) => this._config.sounds.get(id)!);
    return this.pauseSounds(
      sounds,
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  protected async unpauseSounds(
    sounds: Sound[],
    layer?: string,
    group?: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    await this.loadAll(sounds);
    sounds.forEach((sound) => {
      if (layer) {
        this.setLayer(sound.id, layer);
      }
      if (group) {
        this.setGroup(sound.id, group);
      }
      const controlState = this.getOrCreatePlaybackState(sound.id);
      controlState.paused = false;
    });
    this._events.onUnpause.dispatch(sounds, offset || 0, scheduled || false);
    onReady?.();
  }

  async unpauseAll(
    sounds: Sound[],
    layer: string,
    group: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.unpauseSounds(sounds, layer, group, offset, scheduled, onReady);
  }

  async unpause(
    sound: Sound,
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.unpauseSounds(
      [sound],
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  async unpauseLayer(
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    const sounds = ids.map((id) => this._config.sounds.get(id)!);
    return this.unpauseSounds(
      sounds,
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  protected async muteSounds(
    sounds: Sound[],
    layer?: string,
    group?: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    sounds.forEach((sound) => {
      if (layer) {
        this.setLayer(sound.id, layer);
      }
      if (group) {
        this.setGroup(sound.id, group);
      }
      const controlState = this.getOrCreatePlaybackState(sound.id);
      controlState.muted = true;
    });
    await this.loadAll(sounds);
    this._events.onMute.dispatch(sounds, offset || 0, scheduled || false);
    onReady?.();
  }

  async muteAll(
    sounds: Sound[],
    layer: string,
    group: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.muteSounds(sounds, layer, group, offset, scheduled, onReady);
  }

  async mute(
    sound: Sound,
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.muteSounds(
      [sound],
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  async muteLayer(
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    const sounds = ids.map((id) => this._config.sounds.get(id)!);
    return this.muteSounds(
      sounds,
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  protected async unmuteSounds(
    sounds: Sound[],
    layer?: string,
    group?: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    sounds.forEach((sound) => {
      if (layer) {
        this.setLayer(sound.id, layer);
      }
      if (group) {
        this.setGroup(sound.id, group);
      }
      const controlState = this.getOrCreatePlaybackState(sound.id);
      controlState.muted = false;
    });
    await this.loadAll(sounds);
    this._events.onUnmute.dispatch(sounds, offset || 0, scheduled || false);
    onReady?.();
  }

  async unmuteAll(
    sounds: Sound[],
    layer: string,
    group: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.unmuteSounds(sounds, layer, group, offset, scheduled, onReady);
  }

  async unmute(
    sound: Sound,
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    return this.unmuteSounds(
      [sound],
      layer,
      undefined,
      offset,
      scheduled,
      onReady
    );
  }

  async unmuteLayer(
    layer: string,
    offset?: number,
    scheduled?: boolean,
    onReady?: () => void
  ) {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    const sounds = ids.map((id) => this._config.sounds.get(id)!);
    return this.unmuteSounds(
      sounds,
      layer,
      undefined,
      offset,
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
