import { type RecursivePartial } from "../../../core/types/RecursivePartial";
import { type Reference } from "../../../core/types/Reference";
import { type OscillatorType } from "./OscillatorType";

export type Direction = "up" | "down" | "down-up" | "up-down";

export interface Modulator {
  on: boolean;
  order?: number;
  shape: OscillatorType;
  rate: number;
  rate_ramp: number;
  strength: number;
  strength_ramp: number;
}

export interface Synth extends Reference<"synth"> {
  name?: string;
  shape: OscillatorType;
  phase: number;
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
  };
  vibrato: Modulator;
  harmonics: {
    on: boolean;
    count: number;
    count_ramp: number;
    falloff: number;
    falloff_ramp: number;
  };
  fm: {
    on: boolean;
    ratio: number;
    ratio_ramp: number;
    strength: number;
    strength_ramp: number;
  };
  arpeggio: {
    on: boolean;
    rate: number;
    rate_ramp: number;
    max_octaves: number;
    max_notes: number;
    glide: number;
    direction: Direction;
    tones: number[];
    levels: number[];
    shapes: OscillatorType[];
    phases: number[];
  };
  tremolo: Modulator;
  ring: Modulator;
  wahwah: Modulator;
  distortion: {
    on: boolean;
    grit: number;
    grit_ramp: number;
    edge: number;
    edge_ramp: number;
  };
  bitcrush: {
    on: boolean;
    crush: number;
    crush_ramp: number;
    skip: number;
    skip_ramp: number;
  };
  delay: {
    on: boolean;
    length: number;
    strength: number;
    feedback: number;
  };
  reverb: {
    on: boolean;
    room_size: number;
    mix: number;
    damping: number;
  };
  lowpass: {
    on: boolean;
    cutoff: number;
    cutoff_ramp: number;
    resonance: number;
  };
  highpass: {
    on: boolean;
    cutoff: number;
    cutoff_ramp: number;
  };
}

export interface SynthConfig extends RecursivePartial<Synth> {}
