import { RecursivePartial } from "../../core/types/RecursivePartial";
import { OscillatorType } from "./OscillatorType";

export interface Modulator {
  on: boolean;
  shape: OscillatorType;
  rate: number;
  rateRamp: number;
  strength: number;
  strengthRamp: number;
}

export interface Synth {
  name?: string;
  shape: OscillatorType;
  envelope: {
    volume: number;
    volumeRamp: number;
    offset: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    level: number;
  };
  pitch: {
    frequency: number;
    frequencyRamp: number;
    frequencyTorque: number;
    frequencyJerk: number;
    phase: number;
  };
  lowpass: {
    cutoff: number;
    cutoffRamp: number;
    resonance: number;
  };
  highpass: {
    cutoff: number;
    cutoffRamp: number;
  };
  distortion: {
    on: boolean;
    grit: number;
    gritRamp: number;
    edge: number;
    edgeRamp: number;
  };
  arpeggio: {
    on: boolean;
    rate: number;
    rateRamp: number;
    maxOctaves: number;
    maxNotes: number;
    direction: "up" | "down" | "down-up" | "up-down";
    tones: number[];
    levels: number[];
    shapes: OscillatorType[];
  };
  vibrato: Modulator;
  tremolo: Modulator;
  wahwah: Modulator;
  reverb: {
    on: boolean;
    level: number;
    delay: number;
  };
}

export interface SynthConfig extends RecursivePartial<Synth> {}
