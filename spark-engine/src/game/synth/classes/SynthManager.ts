import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { InstrumentState } from "../types/InstrumentState";
import { Tone } from "../types/Tone";
import { createInstrumentState } from "../utils/createInstrumentState";

export interface SynthEvents extends Record<string, GameEvent> {
  onConfigureInstrument: GameEvent<{
    instrumentId: string;
    state: InstrumentState;
  }>;
  onStopInstrument: GameEvent<{
    instrumentId: string;
    duration?: number;
  }>;
  onPlayInstrument: GameEvent<{
    instrumentId: string;
    tones: Tone[];
    onStart?: () => void;
  }>;
}

export interface SynthConfig {}

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
        state: InstrumentState;
      }>(),
      onStopInstrument: new GameEvent<{
        instrumentId: string;
        duration?: number;
      }>(),
      onPlayInstrument: new GameEvent<{
        instrumentId: string;
        tones: Tone[];
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
    options?: Partial<InstrumentState>
  ): void {
    const state = {
      ...createInstrumentState(),
      ...(this._state.instrumentStates[instrumentId] || {}),
      ...(options || {}),
    };
    this._state.instrumentStates[instrumentId] = state;
    this._events.onConfigureInstrument.emit({
      instrumentId,
      state,
    });
  }

  stopInstrument(instrumentId: string, duration?: number): void {
    this._events.onStopInstrument.emit({
      instrumentId,
      duration,
    });
  }

  playInstrument(
    instrumentId: string,
    tones: Tone[],
    onStart?: () => void
  ): void {
    this._events.onPlayInstrument.emit({
      instrumentId,
      tones,
      onStart,
    });
  }
}
