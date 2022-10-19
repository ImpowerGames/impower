import * as TONE from "tone";
import { SparkScene } from "../SparkScene";

export type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};

export type Instrument =
  | TONE.PolySynth<TONE.MetalSynth>
  | TONE.PolySynth
  | TONE.NoiseSynth
  | TONE.PluckSynth
  | TONE.DuoSynth
  | TONE.Sampler;

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

export class SynthScene extends SparkScene {
  private _parts: Record<string, TONE.Part> = {};

  private _instruments: Record<string, Instrument> = {};

  async load(): Promise<void> {
    return TONE.start();
  }

  start(): void {
    this.context?.game?.synth?.events?.onConfigureInstrument?.addListener(
      (data) => this.configureInstrument(data)
    );
    this.context?.game?.synth?.events?.onAttackNote?.addListener((data) =>
      this.attackNote(data)
    );
    this.context?.game?.synth?.events.onReleaseNote?.addListener((data) =>
      this.releaseNote(data)
    );
    this.context?.game?.synth?.events?.onPlayNotes?.addListener((data) =>
      this.playNotes(data)
    );
  }

  destroy(): void {
    this.context?.game?.synth?.events?.onConfigureInstrument?.removeAllListeners();
    this.context?.game?.synth?.events?.onAttackNote?.removeAllListeners();
    this.context?.game?.synth?.events?.onReleaseNote?.removeAllListeners();
    this.context?.game?.synth?.events?.onPlayNotes?.removeAllListeners();
    TONE.Transport.cancel();
    TONE.Transport.stop();
    window.setTimeout(() => {
      Object.values(this._instruments).forEach((instrument) =>
        instrument.dispose()
      );
    }, 100);
  }

  getInstrument(id: string, type?: string): Instrument {
    const key = `${id}/${type}`;
    if (this._instruments[key]) {
      return this._instruments[key];
    }
    if (type === "default") {
      this._instruments[key] = new TONE.PolySynth().toDestination();
    }
    if (type === "am") {
      this._instruments[key] = new TONE.PolySynth(TONE.AMSynth).toDestination();
    }
    if (type === "fm") {
      this._instruments[key] = new TONE.PolySynth(TONE.FMSynth).toDestination();
    }
    if (type === "membrane") {
      this._instruments[key] = new TONE.PolySynth(
        TONE.MembraneSynth
      ).toDestination();
    }
    if (type === "metal") {
      this._instruments[key] = new TONE.PolySynth(
        TONE.MetalSynth
      ).toDestination();
    }
    if (type === "mono") {
      this._instruments[key] = new TONE.PolySynth(
        TONE.MonoSynth
      ).toDestination();
    }
    if (type === "noise") {
      this._instruments[key] = new TONE.NoiseSynth().toDestination();
    }
    if (type === "pluck") {
      this._instruments[key] = new TONE.PluckSynth().toDestination();
    }
    if (type === "duo") {
      this._instruments[key] = new TONE.DuoSynth().toDestination();
    }
    if (type === "sampler") {
      this._instruments[key] = new TONE.Sampler().toDestination();
    }
    return this._instruments[key];
  }

  configureInstrument(data: {
    instrumentId: string;
    instrumentType: string;
    options: RecursivePartial<unknown>;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.set(data.options);
  }

  attackNote(data: {
    instrumentId: string;
    instrumentType: string;
    note: string;
    time?: number;
    velocity?: number;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.triggerAttack(data.note, data.time, data.velocity);
  }

  releaseNote(data: {
    instrumentId: string;
    instrumentType: string;
    time?: number;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    if (data.time) {
      instrument.triggerRelease(data.time);
    }
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
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );

    this.stopNotes();

    let startTime = 0;
    let index = 0;
    const part = new TONE.Part((time, value) => {
      if (index === 0) {
        startTime = time;
      }
      const relativeTime = time - startTime;
      if (index === 0) {
        TONE.Draw.schedule(() => data.onStart?.(relativeTime), time);
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
      TONE.Draw.schedule(() => data.onDraw?.(relativeTime), time);
      if (index === data.notes.length - 1) {
        TONE.Draw.schedule(() => data.onFinished?.(relativeTime), time);
      }
      index += 1;
    }, data.notes).start(0);

    TONE.Transport.start("+0.1");

    this._parts[data.partId] = part;
  }

  stopNotes(): void {
    Object.values(this._parts).forEach((part) => {
      part.mute = true;
    });
    TONE.Transport.cancel();
    TONE.Transport.stop();
  }
}
