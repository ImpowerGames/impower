import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { MIDI_CONTROLLER } from "../constants/MIDI_CONTROLLER";
import { MIDI_PERCUSSION_INSTRUMENTS } from "../constants/MIDI_PERCUSSION_INSTRUMENTS";
import { MIDI_PROGRAM_INSTRUMENTS } from "../constants/MIDI_PROGRAM_INSTRUMENTS";
import { MIDI_STATUS_DATA } from "../constants/MIDI_STATUS_DATA";
import {
  MIDI_STATUS_SYSTEM,
  MIDI_STATUS_TYPE,
} from "../constants/MIDI_STATUS_TYPE";
import { Midi } from "../types/Midi";
import { MidiChannelState } from "../types/MidiChannelState";
import { MidiEvent } from "../types/MidiEvent";
import { SoundPlaybackControl } from "../types/MidiPlaybackState";
import { MidiTrackState } from "../types/MidiTrackState";
import { SynthConfig } from "../types/Synth";
import { Tone } from "../types/Tone";
import { convertMidiToHertz } from "../utils/convertMidiToHertz";
import { createMidiChannelState } from "../utils/createMidiChannelState";
import { createOrResetMidiTrackState } from "../utils/createOrResetMidiTrackState";
import { fillArrayWithTones } from "../utils/fillArrayWithTones";
import { transpose } from "../utils/transpose";

export type ToneSequence = (Tone & { note: number })[];

export interface SoundEvents extends Record<string, GameEvent> {
  onStarted: GameEvent<[string, Float32Array]>;
  onPaused: GameEvent<[string]>;
  onUnpaused: GameEvent<[string]>;
  onStopped: GameEvent<[string]>;
  onUpdate: GameEvent<[number]>;
  onMidiEvent: GameEvent<[string, MidiEvent]>;
}

export interface SoundConfig {
  synths: Record<string, SynthConfig>;
  sampleRate: number;
  midis: Map<string, Midi>;
  sounds: Map<string, Float32Array>;
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
      onStarted: new GameEvent<[string, Float32Array]>(),
      onPaused: new GameEvent<[string]>(),
      onUnpaused: new GameEvent<[string]>(),
      onStopped: new GameEvent<[string]>(),
      onUpdate: new GameEvent<[number]>(),
      onMidiEvent: new GameEvent<[string, MidiEvent]>(),
    };
    const initialConfig: SoundConfig = {
      synths: {},
      sampleRate: 44100,
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

  protected getToneSequences(sound: Midi): ToneSequence[] {
    const midiTrackChannels: ToneSequence[] = [];
    sound.tracks.forEach((track, trackIndex) => {
      const midiChannels: ToneSequence[] = [];
      const midiTrackState = createOrResetMidiTrackState();
      const sortedEvents =
        sound.format === 1 && trackIndex > 0
          ? [...(sound.tracks[0] || []), ...track].sort(
              (a, b) => a.ticks - b.ticks
            )
          : track;
      sortedEvents.forEach((event) => {
        const ticks = event.ticks ?? 0;
        let channelState: MidiChannelState | undefined;
        if (
          event.statusType === MIDI_STATUS_SYSTEM.system_meta &&
          event.statusData === MIDI_STATUS_DATA.system_meta_tempo
        ) {
          midiTrackState.mpq = event.tempoMPQ;
        }
        const mPerTick = midiTrackState.mpq / sound.tpq;
        const msPerTick = mPerTick / 1000;
        const sPerTick = msPerTick / 1000;
        const time = ticks * sPerTick;
        if (event.statusType === MIDI_STATUS_TYPE.voice_controller_change) {
          const channelNumber = event.statusChannel;
          channelState =
            midiTrackState.channels[channelNumber] ||
            createMidiChannelState(channelNumber);
          if (event.controllerNumber === MIDI_CONTROLLER.volume) {
            channelState.volume = event.controllerValue;
          }
          if (event.controllerNumber === MIDI_CONTROLLER.expression) {
            channelState.volume *= event.controllerValue;
          }
          if (event.controllerNumber === MIDI_CONTROLLER.modulation_wheel) {
            // TODO: Modulation?
          }
          if (event.controllerNumber === MIDI_CONTROLLER.sustain_pedal) {
            // TODO: Sustain?
          }
          if (event.controllerNumber === MIDI_CONTROLLER.poly_operation) {
            // TODO: Poly Operation?
          }
        }
        if (event.statusType === MIDI_STATUS_TYPE.voice_program_change) {
          const instrumentNumber = event.programNumber;
          const channelNumber = event.statusChannel;
          channelState =
            midiTrackState.channels[channelNumber] ||
            createMidiChannelState(channelNumber);
          channelState.instrument = instrumentNumber;
          midiTrackState.channels[channelNumber] = channelState;
        }
        if (event.statusType === MIDI_STATUS_TYPE.voice_pitch_bend) {
          const channelNumber = event.statusChannel;
          const pitchBend = event.pitchBend;
          channelState =
            midiTrackState.channels[channelNumber] ||
            createMidiChannelState(channelNumber);
          channelState.pitchBend = pitchBend;
          midiTrackState.channels[channelNumber] = channelState;
        }
        if (event.statusType === MIDI_STATUS_TYPE.voice_note_off) {
          const channelNumber = event.statusChannel;
          const noteNumber = event.noteOffNumber;
          const midiChannel = midiChannels[channelNumber] || [];
          const noteOnIndex = midiChannel
            .map((tone) => tone.note)
            .lastIndexOf(noteNumber);
          const tone = midiChannel[noteOnIndex];
          if (tone) {
            tone.duration = time - (tone.time ?? 0);
          }
          midiChannels[channelNumber] = midiChannel;
        }
        if (event.statusType === MIDI_STATUS_TYPE.voice_note_on) {
          const channelNumber = event.statusChannel;
          const noteNumber = event.noteOnNumber;
          const noteVelocity = event.noteOnVelocity;
          const midiChannel = midiChannels[channelNumber] || [];
          const instrumentNumber = channelState?.instrument ?? 0;
          const isPercussion = channelState?.isPercussion;
          const defaultInstrumentSounds = isPercussion
            ? MIDI_PERCUSSION_INSTRUMENTS
            : MIDI_PROGRAM_INSTRUMENTS;
          const instrumentSoundKey =
            Object.keys(defaultInstrumentSounds)[instrumentNumber] ?? "";
          const pitchBend = channelState?.pitchBend ?? 0;
          const volume = channelState?.volume ?? 1;
          const hertz = transpose(convertMidiToHertz(noteNumber), pitchBend);
          const velocity = noteVelocity * volume;
          if (midiChannel) {
            midiChannel.push({
              time,
              note: noteNumber,
              hertz,
              velocity,
              synth: this._config.synths[instrumentSoundKey],
            });
          }
          midiChannels[channelNumber] = midiChannel;
        }
      });
      midiTrackChannels.push(...midiChannels);
    });
    return midiTrackChannels;
  }

  protected getNumberOfSamples(sound: Tone[]): number {
    let maxMS = 0;
    sound.forEach((tone) => {
      const timeMS = (tone.time ?? 0) + (tone.duration ?? 0);
      if (timeMS > maxMS) {
        maxMS = timeMS;
      }
    });
    return this._config.sampleRate * maxMS;
  }

  protected loadBuffer(sound: Midi | Tone[] | Float32Array): Float32Array {
    if ("tracks" in sound) {
      const toneSequences = this.getToneSequences(sound);
      const lengths = toneSequences.map((tones) =>
        this.getNumberOfSamples(tones)
      );
      const maxLength = Math.max(...lengths);
      const buffer = new Float32Array(maxLength);
      toneSequences.forEach((tones) => {
        fillArrayWithTones(tones, this.config.sampleRate, buffer);
      });
      return buffer;
    }
    if (Array.isArray(sound)) {
      const buffer = new Float32Array(this.getNumberOfSamples(sound));
      fillArrayWithTones(sound, this.config.sampleRate, buffer);
      return buffer;
    }
    return sound;
  }

  start(
    id: string,
    sound: Midi | Tone[] | Float32Array,
    onStarted?: () => void
  ): void {
    const buffer = this.loadBuffer(sound);
    const durationMS = (buffer.length / this._config.sampleRate) * 1000;
    const controlState = {
      elapsedMS: -1,
      durationMS,
      latestEvent: -1,
      started: false,
      paused: false,
    };
    this._state.playbackStates[id] = controlState;
    this._config.sounds.set(id, buffer);
    if (!Array.isArray(sound) && "tracks" in sound) {
      this._config.midis.set(id, sound);
    }
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
    this._events.onPaused.emit(id);
  }

  unpause(id: string): void {
    const controlState = this._state.playbackStates[id];
    if (!controlState) {
      return;
    }
    controlState.paused = false;
    this._events.onUnpaused.emit(id);
  }

  stop(id: string): void {
    delete this._state.playbackStates[id];
    this._config.sounds.delete(id);
    this._config.midis.delete(id);
    this._events.onStopped.emit(id);
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
        this._events.onStarted.emit(id, sound);
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
          const tpq = sound.tpq ?? 0;
          if (
            event.statusType === MIDI_STATUS_SYSTEM.system_meta &&
            event.statusData === MIDI_STATUS_DATA.system_meta_tempo
          ) {
            midiTrackState.mpq = event.tempoMPQ;
          }
          const mPerTick = midiTrackState.mpq / tpq;
          const msPerTick = mPerTick / 1000;
          const timeMS = ticks * msPerTick;
          if (
            index > controlState.latestEvent &&
            controlState.elapsedMS >= timeMS
          ) {
            this._events.onMidiEvent.emit(id, event);
            controlState.latestEvent = index;
          }
        });
      });
    });
    this._events.onUpdate.emit(deltaMS);
  }
}
