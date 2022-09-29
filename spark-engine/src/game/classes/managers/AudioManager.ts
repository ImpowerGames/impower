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

export interface AudioState {
  playing: string[];
}

export interface AudioEvents {
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
  }>;
  onStopNotes: GameEvent;
}

export class AudioManager extends Manager<AudioState, AudioEvents> {
  getInitialState(): AudioState {
    return {
      playing: [],
    };
  }

  getInitialEvents(): AudioEvents {
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
      }>(),
      onStopNotes: new GameEvent(),
    };
  }

  getSaveData(): AudioState {
    return this.deepCopyState(this.state);
  }

  configureInstrument(data: {
    instrumentId: string;
    instrumentType: string;
    options: Partial<SynthOptions>;
  }): void {
    this.events.onConfigureInstrument.emit(data);
  }

  attackNote(data: {
    instrumentId: string;
    instrumentType: string;
    note: string;
    time?: number;
    velocity?: number;
  }): void {
    this.events.onAttackNote.emit(data);
  }

  releaseNote(data: {
    instrumentId: string;
    instrumentType: string;
    time?: number;
  }): void {
    this.events.onReleaseNote.emit(data);
  }

  playNotes(data: {
    partId: string;
    instrumentId: string;
    instrumentType: string;
    notes: {
      note: string[];
      time: number;
      duration?: number[];
      velocity?: number[];
      offset?: number[];
    }[];
    onDraw?: (time: number) => void;
    onStart?: (time: number) => void;
    onFinished?: (time: number) => void;
  }): void {
    this.events.onPlayNotes.emit(data);
  }

  stopNotes(): void {
    this.events.onStopNotes.emit();
  }
}
