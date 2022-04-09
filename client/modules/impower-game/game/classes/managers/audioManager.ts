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

export interface InstrumentTypeMap {
  default: Tone.PolySynth<Tone.Synth>;
  am: Tone.PolySynth<Tone.AMSynth>;
  fm: Tone.PolySynth<Tone.FMSynth>;
  membrane: Tone.PolySynth<Tone.MembraneSynth>;
  metal: Tone.PolySynth<Tone.MetalSynth>;
  mono: Tone.PolySynth<Tone.MonoSynth>;
  noise: Tone.NoiseSynth;
  pluck: Tone.PluckSynth;
  duo: Tone.DuoSynth;
  sampler: Tone.Sampler;
}

export interface AudioState {
  playing: string[];
}

export interface AudioEvents {
  onConfigureInstrument: GameEvent<{
    instrument: InstrumentType;
    options: RecursivePartial<Tone.SynthOptions>;
  }>;
  onAttackNote: GameEvent<{
    instrument: InstrumentType;
    note: Tone.Unit.Frequency | Tone.FrequencyClass<number>;
    time?: number;
    velocity?: number;
  }>;
  onReleaseNote: GameEvent<{
    instrument: InstrumentType;
    time?: number;
  }>;
  onPlayNotes: GameEvent<{
    instrument: InstrumentType;
    notes: {
      note: Tone.Unit.Frequency[];
      time: number;
      duration: number[];
      velocity?: number[];
    }[];
  }>;
}

const instruments: InstrumentTypeMap = {
  default: undefined,
  am: undefined,
  fm: undefined,
  membrane: undefined,
  metal: undefined,
  mono: undefined,
  noise: undefined,
  pluck: undefined,
  duo: undefined,
  sampler: undefined,
};

export class AudioManager extends Manager<AudioState, AudioEvents> {
  private parts: Record<string, Tone.Part> = {};

  getInitialState(): AudioState {
    return {
      playing: [],
    };
  }

  getInitialEvents(): AudioEvents {
    return {
      onConfigureInstrument: new GameEvent<{
        instrument: InstrumentType;
        options: RecursivePartial<Tone.SynthOptions>;
      }>(),
      onAttackNote: new GameEvent<{
        instrument: InstrumentType;
        note: Tone.Unit.Frequency | Tone.FrequencyClass<number>;
        time?: number;
        velocity?: number;
      }>(),
      onReleaseNote: new GameEvent<{
        instrument: InstrumentType;
        time?: number;
      }>(),
      onPlayNotes: new GameEvent<{
        instrument: InstrumentType;
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
    Tone.Transport.stop();
  }

  getInstrument<K extends keyof InstrumentTypeMap>(
    type?: K
  ): InstrumentTypeMap[K] {
    if (instruments[type]) {
      return instruments[type];
    }
    if (type === "default") {
      instruments.default = new Tone.PolySynth().toDestination();
    }
    if (type === "am") {
      instruments.am = new Tone.PolySynth(Tone.AMSynth).toDestination();
    }
    if (type === "fm") {
      instruments.fm = new Tone.PolySynth(Tone.FMSynth).toDestination();
    }
    if (type === "membrane") {
      instruments.membrane = new Tone.PolySynth(
        Tone.MembraneSynth
      ).toDestination();
    }
    if (type === "metal") {
      instruments.metal = new Tone.PolySynth(Tone.MetalSynth).toDestination();
    }
    if (type === "mono") {
      instruments.mono = new Tone.PolySynth(Tone.MonoSynth).toDestination();
    }
    if (type === "noise") {
      instruments.noise = new Tone.NoiseSynth().toDestination();
    }
    if (type === "pluck") {
      instruments.pluck = new Tone.PluckSynth().toDestination();
    }
    if (type === "duo") {
      instruments.duo = new Tone.DuoSynth().toDestination();
    }
    if (type === "sampler") {
      instruments.sampler = new Tone.Sampler().toDestination();
    }
    return instruments[type];
  }

  configureInstrument(data: {
    instrument: InstrumentType;
    options: RecursivePartial<Tone.SynthOptions>;
  }): void {
    const instrument = this.getInstrument(data.instrument);
    instrument.set(data.options);
    this.events.onConfigureInstrument.emit(data);
  }

  attackNote(data: {
    instrument: InstrumentType;
    note: Tone.Unit.Frequency;
    time?: number;
    velocity?: number;
  }): void {
    const instrument = this.getInstrument(data.instrument);
    instrument.triggerAttack(data.note, data.time, data.velocity);
    this.events.onAttackNote.emit(data);
  }

  releaseNote(data: { instrument: InstrumentType; time?: number }): void {
    const instrument = this.getInstrument(data.instrument);
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
    id: string;
    instrument: InstrumentType;
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
    const instrument = this.getInstrument(data.instrument);

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
        this.state.playing = this.state.playing.filter((x) => x !== data.id);
        Tone.Draw.schedule(() => data.onFinished?.(relativeTime), time);
      }
      index += 1;
    }, data.notes).start(0);

    Tone.Transport.start("+0.1");

    this.parts[data.id] = part;
    this.state.playing.push(data.id);
    this.events.onPlayNotes.emit(data);
  }
}
