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

export interface Sound {
  seed: string;
  wave: OscillatorType;
  frequency: {
    pitch: number;
    ramp: number;
    accel: number;
    jerk: number;
  };
  amplitude: {
    volume: number;
    ramp: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    sustainLevel: number;
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
  arpeggio: {
    on: boolean;
    rate: number;
    rateRamp: number;
    semitones: number[];
    shapes: OscillatorType[];
    direction: "up" | "down" | "down-up" | "up-down" | "random";
    maxOctaves: number;
    maxNotes: number;
  };
  harmony: {
    on: boolean;
    count: number;
    strength: number;
    strengthRamp: number;
    delay: number;
    delayRamp: number;
  };
  reverb: {
    on: boolean;
    strength: number;
    strengthRamp: number;
    delay: number;
    delayRamp: number;
  };
  vibrato: Modulator;
  tremolo: Modulator;
  ring: Modulator;
  wahwah: Modulator;
}

export interface SoundConfig extends RecursivePartial<Sound> {}
