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
    pitchRamp: number;
    accel: number;
    jerk: number;
  };
  amplitude: {
    volume: number;
    volumeRamp: number;
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
    tones: number[];
    shapes: OscillatorType[];
    direction: "up" | "down" | "down-up" | "up-down" | "random";
    maxOctaves: number;
    maxNotes: number;
  };
  harmony: {
    on: boolean;
    shapes: OscillatorType[];
    count: number;
    falloff: number;
    falloffRamp: number;
  };
  reverb: {
    on: boolean;
    strength: number;
    strengthRamp: number;
    delay: number;
    delayRamp: number;
  };
  distortion: Modulator;
  vibrato: Modulator;
  tremolo: Modulator;
  ring: Modulator;
  wahwah: Modulator;
}

export interface SoundConfig extends RecursivePartial<Sound> {}
