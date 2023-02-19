import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { MidiEvent } from "../types/MidiEvent";

export interface MidiEvents extends Record<string, GameEvent> {
  onStop: GameEvent<{
    id: string;
    duration?: number;
  }>;
  onPlay: GameEvent<{
    id: string;
    tpq: number;
    events: MidiEvent[];
    onStart?: () => void;
  }>;
}

export interface MidiConfig {}

export interface MidiState {}

export class MidiManager extends Manager<MidiEvents, MidiConfig, MidiState> {
  constructor(config?: Partial<MidiConfig>, state?: Partial<MidiState>) {
    const initialEvents: MidiEvents = {
      onStop: new GameEvent<{
        id: string;
        duration?: number;
      }>(),
      onPlay: new GameEvent<{
        id: string;
        tpq: number;
        events: MidiEvent[];
        onStart?: () => void;
      }>(),
    };
    const initialConfig: MidiConfig = {
      ...(config || {}),
    };
    const initialState: MidiState = {
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  stop(id: string, duration?: number): void {
    this._events.onStop.emit({
      id,
      duration,
    });
  }

  play(
    id: string,
    tpq: number,
    events: MidiEvent[],
    onStart?: () => void
  ): void {
    this._events.onPlay.emit({
      id,
      tpq,
      events,
      onStart,
    });
  }
}
