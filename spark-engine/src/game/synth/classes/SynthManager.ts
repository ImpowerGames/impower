import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { InstrumentState } from "../types/InstrumentState";
import { Tone } from "../types/Tone";
import { createInstrumentState } from "../utils/createInstrumentState";

export interface SynthEvents extends Record<string, GameEvent> {
  onConfigure: GameEvent<{
    id: string;
    state: InstrumentState;
  }>;
  onStop: GameEvent<{
    id: string;
    duration?: number;
  }>;
  onPlay: GameEvent<{
    id: string;
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
      onConfigure: new GameEvent<{
        id: string;
        state: InstrumentState;
      }>(),
      onStop: new GameEvent<{
        id: string;
        duration?: number;
      }>(),
      onPlay: new GameEvent<{
        id: string;
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

  configure(id: string, options?: Partial<InstrumentState>): void {
    const state = {
      ...createInstrumentState(),
      ...(this._state.instrumentStates[id] || {}),
      ...(options || {}),
    };
    this._state.instrumentStates[id] = state;
    this._events.onConfigure.emit({
      id,
      state,
    });
  }

  stop(id: string, duration?: number): void {
    this._events.onStop.emit({
      id,
      duration,
    });
  }

  play(id: string, tones: Tone[], onStart?: () => void): void {
    this._events.onPlay.emit({
      id,
      tones,
      onStart,
    });
  }
}
