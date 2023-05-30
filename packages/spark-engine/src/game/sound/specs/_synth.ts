import { Create } from "../../core/types/Create";
import { A } from "../constants/A";
import { Synth } from "../types/Synth";

export const _synth: Create<Synth> = () => ({
  shape: "triangle",
  envelope: {
    volume: 0.5,
    volumeRamp: 0,
    offset: 0,
    attack: 0,
    decay: 0.025,
    sustain: 0.05,
    release: 0.025,
    level: 0.5,
  },
  pitch: {
    frequency: A[4],
    frequencyRamp: 0,
    frequencyTorque: 0,
    frequencyJerk: 0,
    phase: 0,
  },
  lowpass: {
    cutoff: 0,
    cutoffRamp: 0,
    resonance: 0,
  },
  highpass: {
    cutoff: 0,
    cutoffRamp: 0,
  },
  distortion: {
    on: false,
    edge: 0.5,
    edgeRamp: 0,
    grit: 0,
    gritRamp: 0,
  },
  arpeggio: {
    on: false,
    rate: 12,
    rateRamp: 0,
    maxOctaves: 1,
    maxNotes: 160,
    direction: "up",
    tones: [],
    levels: [],
    shapes: [],
  },
  vibrato: {
    on: false,
    shape: "sine",
    strength: 0.5,
    strengthRamp: 0,
    rate: 6,
    rateRamp: 0,
  },
  tremolo: {
    on: false,
    shape: "sine",
    strength: 0.5,
    strengthRamp: 0,
    rate: 12,
    rateRamp: 0,
  },
  wahwah: {
    on: false,
    shape: "sine",
    strength: 0.5,
    strengthRamp: 0,
    rate: 6,
    rateRamp: 0,
  },
  reverb: {
    on: false,
    level: 0.5,
    delay: 0.15,
  },
});
