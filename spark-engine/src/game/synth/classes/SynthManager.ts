import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { InstrumentConfig } from "../types/InstrumentConfig";
import { InstrumentOptions } from "../types/InstrumentOptions";
import { InstrumentState } from "../types/InstrumentState";
import { MidiTrack } from "../types/MidiTrack";

export interface SynthEvents extends Record<string, GameEvent> {
  onConfigureInstrument: GameEvent<{
    instrumentId: string;
    options?: Partial<InstrumentOptions>;
  }>;
  onStopInstrument: GameEvent<{
    instrumentId: string;
    duration?: number;
  }>;
  onPlayInstrument: GameEvent<{
    instrumentId: string;
    tracks: MidiTrack[];
  }>;
}

export interface SynthConfig {
  instruments: Record<string, InstrumentConfig>;
}

export interface SynthState {
  instrumentStates: Record<string, InstrumentState>;
}

export class SynthManager extends Manager<
  SynthEvents,
  SynthConfig,
  SynthState
> {
  constructor(config?: Partial<SynthConfig>, state?: Partial<SynthState>) {
    const initialEvents: SynthEvents = {
      onConfigureInstrument: new GameEvent<{
        instrumentId: string;
        options?: Partial<InstrumentOptions>;
      }>(),
      onStopInstrument: new GameEvent<{
        instrumentId: string;
        duration?: number;
      }>(),
      onPlayInstrument: new GameEvent<{
        instrumentId: string;
        tracks: MidiTrack[];
      }>(),
    };
    const initialConfig: SynthConfig = {
      instruments: {},
      ...(config || {}),
    };
    const initialState: SynthState = {
      instrumentStates: {},
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  configureInstrument(
    instrumentId: string,
    options?: Partial<InstrumentOptions>
  ): void {
    const instrumentConfig: InstrumentConfig =
      this._config.instruments[instrumentId] || {};
    if (instrumentConfig) {
      instrumentConfig.envelope = options?.envelope;
      instrumentConfig.oscillator = options?.oscillator;
    }
    this._config.instruments[instrumentId] = instrumentConfig;
    const instrumentState: InstrumentState =
      this._state.instrumentStates[instrumentId] || {};
    if (instrumentState) {
      instrumentState.detune = options?.detune;
      instrumentState.portamento = options?.portamento;
      instrumentState.volume = options?.volume;
    }
    this._state.instrumentStates[instrumentId] = instrumentState;
    this._events.onConfigureInstrument.emit({
      instrumentId,
      options,
    });
  }

  stopInstrument(instrumentId: string, duration?: number): void {
    this._events.onStopInstrument.emit({
      instrumentId,
      duration,
    });
  }

  playInstrument(instrumentId: string, ...tracks: MidiTrack[]): void {
    this._events.onPlayInstrument.emit({
      instrumentId,
      tracks,
    });
  }
}
