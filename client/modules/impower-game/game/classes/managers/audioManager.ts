import * as Tone from "tone";
import { RecursivePartial } from "../../../../impower-core";
import { GameEvent } from "../events/gameEvent";
import { Manager } from "./manager";

export type InstrumentType =
  | "default"
  | "am"
  | "duo"
  | "fm"
  | "membrane"
  | "metal"
  | "mono"
  | "noise"
  | "pluck"
  | "sampler";

export interface AudioState {
  playing: string[];
}

export interface AudioEvents {
  onConfigureInstrument: GameEvent<{
    instrumentId: string;
    instrumentType: InstrumentType;
    options: RecursivePartial<Tone.SynthOptions>;
  }>;
  onAttackNote: GameEvent<{
    instrumentId: string;
    instrumentType: InstrumentType;
    note: Tone.Unit.Frequency | Tone.FrequencyClass<number>;
    time?: number;
    velocity?: number;
  }>;
  onReleaseNote: GameEvent<{
    instrumentId: string;
    instrumentType: InstrumentType;
    time?: number;
  }>;
  onPlayNotes: GameEvent<{
    instrumentId: string;
    instrumentType: InstrumentType;
    partId: string;
    notes: {
      note: Tone.Unit.Frequency[];
      time: number;
      duration: number[];
      velocity?: number[];
    }[];
  }>;
}

type Instrument =
  | Tone.PolySynth<Tone.MetalSynth>
  | Tone.PolySynth
  | Tone.NoiseSynth
  | Tone.PluckSynth
  | Tone.DuoSynth
  | Tone.Sampler;

export class AudioManager extends Manager<AudioState, AudioEvents> {
  private parts: Record<string, Tone.Part> = {};

  instruments: Record<string, Instrument> = {};

  getInitialState(): AudioState {
    return {
      playing: [],
    };
  }

  getInitialEvents(): AudioEvents {
    return {
      onConfigureInstrument: new GameEvent<{
        instrumentId: string;
        instrumentType: InstrumentType;
        options: RecursivePartial<Tone.SynthOptions>;
      }>(),
      onAttackNote: new GameEvent<{
        instrumentId: string;
        instrumentType: InstrumentType;
        note: Tone.Unit.Frequency | Tone.FrequencyClass<number>;
        time?: number;
        velocity?: number;
      }>(),
      onReleaseNote: new GameEvent<{
        instrumentId: string;
        instrumentType: InstrumentType;
        time?: number;
      }>(),
      onPlayNotes: new GameEvent<{
        instrumentId: string;
        instrumentType: InstrumentType;
        partId: string;
        notes: {
          note: Tone.Unit.Frequency[];
          time: number;
          duration: number[];
          velocity?: number[];
        }[];
      }>(),
    };
  }

  getSaveData(): AudioState {
    return this.deepCopyState(this.state);
  }

  async start(): Promise<void> {
    await Tone.start();
    await super.start();
  }

  destroy(): void {
    Tone.Transport.cancel();
    Tone.Transport.stop();
    window.setTimeout(() => {
      Object.values(this.instruments).forEach((instrument) =>
        instrument.dispose()
      );
    }, 100);
  }

  getInstrument<K extends InstrumentType>(id: string, type?: K): Instrument {
    const key = `${id}/${type}`;
    if (this.instruments[key]) {
      return this.instruments[key];
    }
    if (type === "default") {
      this.instruments[key] = new Tone.PolySynth().toDestination();
    }
    if (type === "am") {
      this.instruments[key] = new Tone.PolySynth(Tone.AMSynth).toDestination();
    }
    if (type === "fm") {
      this.instruments[key] = new Tone.PolySynth(Tone.FMSynth).toDestination();
    }
    if (type === "membrane") {
      this.instruments[key] = new Tone.PolySynth(
        Tone.MembraneSynth
      ).toDestination();
    }
    if (type === "metal") {
      this.instruments[key] = new Tone.PolySynth(
        Tone.MetalSynth
      ).toDestination();
    }
    if (type === "mono") {
      this.instruments[key] = new Tone.PolySynth(
        Tone.MonoSynth
      ).toDestination();
    }
    if (type === "noise") {
      this.instruments[key] = new Tone.NoiseSynth().toDestination();
    }
    if (type === "pluck") {
      this.instruments[key] = new Tone.PluckSynth().toDestination();
    }
    if (type === "duo") {
      this.instruments[key] = new Tone.DuoSynth().toDestination();
    }
    if (type === "sampler") {
      this.instruments[key] = new Tone.Sampler().toDestination();
    }
    return this.instruments[key];
  }

  configureInstrument(data: {
    instrumentId: string;
    instrumentType: InstrumentType;
    options: RecursivePartial<Tone.SynthOptions>;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.set(data.options);
    this.events.onConfigureInstrument.emit(data);
  }

  attackNote(data: {
    instrumentId: string;
    instrumentType: InstrumentType;
    note: Tone.Unit.Frequency;
    time?: number;
    velocity?: number;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.triggerAttack(data.note, data.time, data.velocity);
    this.events.onAttackNote.emit(data);
  }

  releaseNote(data: {
    instrumentId: string;
    instrumentType: InstrumentType;
    time?: number;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.triggerRelease(data.time);
    this.events.onReleaseNote.emit(data);
  }

  stopNotes(): void {
    Object.values(this.parts).forEach((part) => {
      part.mute = true;
    });
    Tone.Transport.cancel();
    Tone.Transport.stop();
  }

  playNotes(data: {
    partId: string;
    instrumentId: string;
    instrumentType: InstrumentType;
    notes: {
      note: Tone.Unit.Frequency[];
      time: number;
      duration: number[];
      velocity?: number[];
      offset?: number[];
    }[];
    onDraw?: (time: number) => void;
    onStart?: (time: number) => void;
    onFinished?: (time: number) => void;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );

    this.stopNotes();

    let startTime = 0;
    let index = 0;
    const part = new Tone.Part((time, value) => {
      if (index === 0) {
        startTime = time;
      }
      const relativeTime = time - startTime;
      if (index === 0) {
        Tone.Draw.schedule(() => data.onStart?.(relativeTime), time);
      }
      if (value.note && value.duration) {
        const notes = value.note;
        const durations = value.duration;
        const velocities = value.velocity;
        const offsets = value.offset;
        for (let i = 0; i < notes.length; i += 1) {
          const noteTime = time + (offsets?.[i] || 0);
          instrument.triggerAttack(notes[i], noteTime, velocities?.[i] || 0);
          const d = durations[Math.min(i, durations.length - 1)];
          instrument.triggerRelease(notes[i], noteTime + d);
        }
      }
      Tone.Draw.schedule(() => data.onDraw?.(relativeTime), time);
      if (index === data.notes.length - 1) {
        this.state.playing = this.state.playing.filter(
          (x) => x !== data.partId
        );
        Tone.Draw.schedule(() => data.onFinished?.(relativeTime), time);
      }
      index += 1;
    }, data.notes).start(0);

    Tone.Transport.start("+0.1");

    this.parts[data.partId] = part;
    this.state.playing.push(data.partId);
    this.events.onPlayNotes.emit(data);
  }
}
