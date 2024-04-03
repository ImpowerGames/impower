import { RecursivePartial } from "../../../core/types/RecursivePartial";
import { OscillatorType } from "./OscillatorType";

export interface Modulator {
  on: boolean;
  shape: OscillatorType;
  rate: number;
  rate_ramp: number;
  strength: number;
  strength_ramp: number;
}

export interface Synth {
  name?: string;
  shape: OscillatorType;
  volume: number;
  envelope: {
    offset: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    level: number;
  };
  pitch: {
    frequency: number;
    frequency_ramp: number;
    frequency_torque: number;
    frequency_jerk: number;
    phase: number;
  };
  lowpass: {
    cutoff: number;
    cutoff_ramp: number;
    resonance: number;
  };
  highpass: {
    cutoff: number;
    cutoff_ramp: number;
  };
  distortion: {
    on: boolean;
    grit: number;
    grit_ramp: number;
    edge: number;
    edge_ramp: number;
  };
  arpeggio: {
    on: boolean;
    rate: number;
    rate_ramp: number;
    max_octaves: number;
    max_notes: number;
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
