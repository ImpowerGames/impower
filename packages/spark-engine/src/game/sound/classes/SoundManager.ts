import { GameEvent1, GameEvent2 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { MIDI_STATUS_DATA } from "../constants/MIDI_STATUS_DATA";
import { MIDI_STATUS_SYSTEM } from "../constants/MIDI_STATUS_TYPE";
import { Midi } from "../types/Midi";
import { MidiEvent } from "../types/MidiEvent";
import { SoundPlaybackControl } from "../types/MidiPlaybackState";
import { MidiTrackState } from "../types/MidiTrackState";
import { SynthConfig } from "../types/Synth";
import { createOrResetMidiTrackState } from "../utils/createOrResetMidiTrackState";
import { SynthBuffer } from "./SynthBuffer";

export interface SoundEvents extends Record<string, GameEvent> {
  onStarted: GameEvent2<string, Float32Array | SynthBuffer | string>;
  onPaused: GameEvent1<string>;
  onUnpaused: GameEvent1<string>;
  onStopped: GameEvent1<string>;
  onUpdate: GameEvent1<number>;
  onMidiEvent: GameEvent2<string, MidiEvent>;
}

export interface SoundConfig {
  synths: Record<string, SynthConfig>;
  midis: Map<string, Midi>;
  sounds: Map<string, Float32Array | SynthBuffer | string>;
}

export interface SoundState {
  playbackStates: Record<string, SoundPlaybackControl>;
}

export class SoundManager extends Manager<
  SoundEvents,
  SoundConfig,
  SoundState
> {
  private _midiTrackStates: Record<string, MidiTrackState> = {};

  private _callbacks: Map<string, undefined | (() => void)[]> = new Map();

  constructor(config?: Partial<SoundConfig>, state?: Partial<SoundState>) {
    const initialEvents: SoundEvents = {
      onStarted: new GameEvent2<string, Float32Array | SynthBuffer | string>(),
      onPaused: new GameEvent1<string>(),
      onUnpaused: new GameEvent1<string>(),
      onStopped: new GameEvent1<string>(),
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
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  start(
    id: string,
    sound: Float32Array | SynthBuffer | string,
    onStarted?: () => void
  ): void {
    const controlState = {
      elapsedMS: -1,
      latestEvent: -1,
      started: false,
      paused: false,
    };
    this._state.playbackStates[id] = controlState;
    this._config.sounds.set(id, sound);
    if (onStarted) {
      if (!this._callbacks.get(id)) {
        this._callbacks.set(id, []);
      }
      const callbacks = this._callbacks.get(id);
      callbacks?.push(onStarted);
    }
  }

  pause(id: string): void {
    const controlState = this._state.playbackStates[id];
    if (!controlState) {
      return;
    }
    controlState.paused = true;
    this._events.onPaused.dispatch(id);
  }

  unpause(id: string): void {
    const controlState = this._state.playbackStates[id];
    if (!controlState) {
      return;
    }
    controlState.paused = false;
    this._events.onUnpaused.dispatch(id);
  }

  stop(id: string): void {
    delete this._state.playbackStates[id];
    this._config.sounds.delete(id);
    this._config.midis.delete(id);
    this._events.onStopped.dispatch(id);
  }

  override update(deltaMS: number): void {
    this._config.sounds.forEach((sound, id) => {
      const controlState = this._state.playbackStates[id];
      if (!controlState || controlState.paused) {
        return;
      }
      controlState.elapsedMS += deltaMS;
      if (!controlState.started) {
        controlState.started = true;
        if (this._callbacks) {
          this._callbacks.get(id)?.forEach((callback) => callback?.());
          this._callbacks.set(id, []);
        }
        this._events.onStarted.dispatch(id, sound);
      }
    });
    this._config.midis.forEach((sound, id) => {
      const controlState = this._state.playbackStates[id];
      if (!controlState || controlState.paused) {
        return;
      }
      // For performance reasons, we reset all existing states
      // rather than creating new state objects every tick
      const midiTrackState = createOrResetMidiTrackState(
        this._midiTrackStates[id]
      );
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
    this._events.onUpdate.dispatch(deltaMS);
  }
}
