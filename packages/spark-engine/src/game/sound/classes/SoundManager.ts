import { GameEvent1, GameEvent2 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { MIDI_STATUS_DATA } from "../constants/MIDI_STATUS_DATA";
import { MIDI_STATUS_SYSTEM } from "../constants/MIDI_STATUS_TYPE";
import { Midi } from "../types/Midi";
import { MidiEvent } from "../types/MidiEvent";
import { MidiTrackState } from "../types/MidiTrackState";
import { SoundPlaybackControl } from "../types/SoundPlaybackControl";
import { SynthConfig } from "../types/Synth";
import { createOrResetMidiTrackState } from "../utils/createOrResetMidiTrackState";
import { SynthBuffer } from "./SynthBuffer";

type SoundSource = Float32Array | SynthBuffer | string;

export interface SoundEvents extends Record<string, GameEvent> {
  onScheduled: GameEvent2<string, SoundSource>;
  onStarted: GameEvent1<string[]>;
  onPaused: GameEvent1<string[]>;
  onUnpaused: GameEvent1<string[]>;
  onStopped: GameEvent1<string[]>;
  onUpdate: GameEvent1<number>;
  onMidiEvent: GameEvent2<string, MidiEvent>;
}

export interface SoundConfig {
  synths: Record<string, SynthConfig>;
  midis: Map<string, Midi>;
  sounds: Map<string, SoundSource>;
}

export interface SoundState {
  playbackStates: Record<string, SoundPlaybackControl>;
  layers: Record<string, string[]>;
  groups: Record<string, string[]>;
  starting: string[];
  pausing: string[];
  unpausing: string[];
  stopping: string[];
}

export class SoundManager extends Manager<
  SoundEvents,
  SoundConfig,
  SoundState
> {
  private _midiStates: Record<string, MidiTrackState> = {};

  private _onStartedCallbacks: Map<string, undefined | (() => void)[]> =
    new Map();

  constructor(config?: Partial<SoundConfig>, state?: Partial<SoundState>) {
    const initialEvents: SoundEvents = {
      onScheduled: new GameEvent2<string, SoundSource>(),
      onStarted: new GameEvent1<string[]>(),
      onPaused: new GameEvent1<string[]>(),
      onUnpaused: new GameEvent1<string[]>(),
      onStopped: new GameEvent1<string[]>(),
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
      starting: [],
      pausing: [],
      unpausing: [],
      stopping: [],
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  protected getOrCreatePlaybackState(id: string) {
    this._state.playbackStates[id] ??= {
      elapsedMS: -1,
      latestEvent: -1,
      ready: false,
      scheduled: false,
      started: false,
      paused: false,
      looping: false,
    };
    return this._state.playbackStates[id]!;
  }

  scheduleGroup(
    layer: string,
    group: string,
    sounds: { id: string; data: SoundSource }[],
    loop: boolean,
    onStarted?: () => void
  ): void {
    sounds.forEach(({ id, data }) => {
      this._state.groups[group] ??= [];
      this._state.groups[group]!.push(id);
      const controlState = this.getOrCreatePlaybackState(id);
      controlState.group = group;
      this.schedule(layer, id, data, loop, onStarted);
    });
  }

  schedule(
    layer: string,
    id: string,
    sound: SoundSource,
    loop: boolean,
    onStarted?: () => void
  ): void {
    this._config.sounds.set(id, sound);
    this._state.layers[layer] ??= [];
    this._state.layers[layer]!.push(id);
    const controlState = this.getOrCreatePlaybackState(id);
    controlState.layer = layer;
    controlState.looping = loop;
    controlState.scheduled = true;
    if (onStarted) {
      if (!this._onStartedCallbacks.get(id)) {
        this._onStartedCallbacks.set(id, []);
      }
      const callbacks = this._onStartedCallbacks.get(id);
      callbacks?.push(onStarted);
    }
    this._events.onScheduled.dispatch(id, sound);
  }

  ready(id: string): void {
    const controlState = this.getOrCreatePlaybackState(id);
    controlState.ready = true;
  }

  pauseAll(layer: string): void {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    ids.forEach((id) => {
      this.pause(id);
    });
  }

  pause(id: string): void {
    const controlState = this.getOrCreatePlaybackState(id);
    controlState.paused = true;
    this._state.pausing.push(id);
  }

  unpauseAll(layer: string): void {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    ids.forEach((id) => {
      this.unpause(id);
    });
  }

  unpause(id: string): void {
    const controlState = this.getOrCreatePlaybackState(id);
    controlState.paused = false;
    this._state.unpausing.push(id);
  }

  stopAll(layer: string): void {
    const ids = this._state.layers[layer];
    if (!ids) {
      return;
    }
    ids.forEach((id) => {
      this.stop(id);
    });
    this._state.layers[layer] = [];
  }

  stop(id: string): void {
    const layer = this._state.playbackStates[id]?.layer;
    if (layer) {
      this._state.layers[layer] =
        this._state.layers[layer]?.filter((x) => x != id) ?? [];
    }
    const group = this._state.playbackStates[id]?.group;
    if (group) {
      this._state.groups[group] =
        this._state.groups[group]?.filter((x) => x != id) ?? [];
    }
    delete this._state.playbackStates[id];
    this._config.sounds.delete(id);
    this._config.midis.delete(id);
    this._state.stopping.push(id);
  }

  protected groupIsReady(group: string) {
    const ids = this._state.groups[group];
    if (!ids) {
      return false;
    }
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]!;
      const controlState = this._state.playbackStates[id];
      if (!controlState || !controlState.ready || !controlState.scheduled) {
        return false;
      }
    }
    return true;
  }

  override update(deltaMS: number): void {
    // Update sound playback
    this._config.sounds.forEach((_, id) => {
      const controlState = this._state.playbackStates[id];
      if (!controlState) {
        return;
      }
      if (!controlState.ready) {
        return;
      }
      if (!controlState.scheduled) {
        return;
      }
      if (controlState.paused) {
        return;
      }
      if (!controlState.started) {
        if (!controlState.group || this.groupIsReady(controlState.group)) {
          controlState.started = true;
          this._state.starting.push(id);
        }
      }
      controlState.elapsedMS += deltaMS;
    });
    // Update midi playback
    this._config.midis.forEach((sound, id) => {
      const controlState = this._state.playbackStates[id];
      if (!controlState) {
        return;
      }
      if (!controlState.ready) {
        return;
      }
      if (!controlState.scheduled) {
        return;
      }
      if (controlState.paused) {
        return;
      }
      // For performance reasons, we reset all existing states
      // rather than creating new state objects every tick
      const midiTrackState = createOrResetMidiTrackState(this._midiStates[id]);
      sound.tracks.forEach((track) => {
        track.forEach((event, index) => {
          const ticks = event.ticks ?? 0;
          if (
            event.statusType === MIDI_STATUS_SYSTEM.system_meta &&
            event.statusData === MIDI_STATUS_DATA.system_meta_tempo
          ) {
            midiTrackState.mpq = event.tempoMPQ;
          }
          const secondsPerQuarterNote = midiTrackState.mpq / 1000000;
          const quarterNotesPerTick = 1 / sound.tpq;
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
    });
    // Notify update
    this._events.onUpdate.dispatch(deltaMS);
    // Notify started
    if (this._state.starting.length > 0) {
      this._state.starting.forEach((id) => {
        if (this._onStartedCallbacks) {
          this._onStartedCallbacks.get(id)?.forEach((callback) => callback?.());
          this._onStartedCallbacks.delete(id);
        }
      });
      this._events.onStarted.dispatch([...this._state.starting]);
      this._state.starting.length = 0;
    }
    // Notify paused
    if (this._state.pausing.length > 0) {
      this._events.onPaused.dispatch([...this._state.pausing]);
      this._state.pausing.length = 0;
    }
    // Notify unpaused
    if (this._state.unpausing.length > 0) {
      this._events.onUnpaused.dispatch([...this._state.unpausing]);
      this._state.unpausing.length = 0;
    }
    // Notify stopped
    if (this._state.stopping.length > 0) {
      this._events.onStopped.dispatch([...this._state.stopping]);
      this._state.stopping.length = 0;
    }
  }
}
