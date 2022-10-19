import { RecursivePartial } from "../../../data";
import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

export interface SynthOptions {
  detune?: number;
  portamento?: number;
  volume?: number;
  envelope?: {
    attack?: number;
    attackCurve?: string;
    decay?: number;
    decayCurve?: string;
    release?: number;
    releaseCurve?: string;
    sustain?: number;
  };
  oscillator?: {
    partialCount?: number;
    phase?: number;
    type?: string;
  };
}

export interface SynthState {
  playing: string[];
}

export interface SynthEvents {
  onConfigureInstrument: GameEvent<{
    instrumentId: string;
    instrumentType: string;
    options: RecursivePartial<SynthOptions>;
  }>;
  onAttackNote: GameEvent<{
    instrumentId: string;
    instrumentType: string;
    note: string;
    time?: number;
    velocity?: number;
  }>;
  onReleaseNote: GameEvent<{
    instrumentId: string;
    instrumentType: string;
    time?: number;
  }>;
  onPlayNotes: GameEvent<{
    instrumentId: string;
    instrumentType: string;
    partId: string;
    notes: {
      note: string[];
      time: number;
      duration?: number[];
      velocity?: number[];
    }[];
    onDraw?: (time: number) => void;
    onStart?: (time: number) => void;
    onFinished?: (time: number) => void;
  }>;
  onStopNotes: GameEvent;
}

export class SynthManager extends Manager<SynthState, SynthEvents> {
  getInitialState(): SynthState {
    return {
      playing: [],
    };
  }

  getInitialEvents(): SynthEvents {
    return {
      onConfigureInstrument: new GameEvent<{
        instrumentId: string;
        instrumentType: string;
        options: Partial<SynthOptions>;
      }>(),
      onAttackNote: new GameEvent<{
        instrumentId: string;
        instrumentType: string;
        note: string;
        time?: number;
        velocity?: number;
      }>(),
      onReleaseNote: new GameEvent<{
        instrumentId: string;
        instrumentType: string;
        time?: number;
      }>(),
      onPlayNotes: new GameEvent<{
        instrumentId: string;
        instrumentType: string;
        partId: string;
        notes: {
          note: string[];
          time: number;
          duration?: number[];
          velocity?: number[];
        }[];
        onDraw?: (time: number) => void;
        onStart?: (time: number) => void;
        onFinished?: (time: number) => void;
      }>(),
      onStopNotes: new GameEvent(),
    };
  }

  override getSaveData(): SynthState {
    return this.deepCopyState(this.state);
  }

  configureInstrument(
    instrumentId: string,
    instrumentType: string,
    options: Partial<SynthOptions>
  ): void {
    this.events.onConfigureInstrument.emit({
      instrumentId,
      instrumentType,
      options,
    });
  }

  attackNote(
    instrumentId: string,
    instrumentType: string,
    note: string,
    time?: number,
    velocity?: number
  ): void {
    this.events.onAttackNote.emit({
      instrumentId,
      instrumentType,
      note,
      time,
      velocity,
    });
  }

  releaseNote(
    instrumentId: string,
    instrumentType: string,
    time: number
  ): void {
    this.events.onReleaseNote.emit({ instrumentId, instrumentType, time });
  }

  playNotes(
    partId: string,
    instrumentId: string,
    instrumentType: string,
    notes: {
      note: string[];
      time: number;
      duration?: number[];
      velocity?: number[];
      offset?: number[];
    }[],
    onDraw?: (time: number) => void,
    onStart?: (time: number) => void,
    onFinished?: (time: number) => void
  ): void {
    this.events.onPlayNotes.emit({
      partId,
      instrumentId,
      instrumentType,
      notes,
      onDraw,
      onStart,
      onFinished,
    });
  }

  stopNotes(): void {
    this.events.onStopNotes.emit();
  }
}
