import { Create } from "../../../core/types/Create";
import { A } from "../../constants/A";
import { Synth } from "../Synth";

export const _synth: Create<Synth> = () => ({
  shape: "triangle",
  envelope: {
    volume: 0.5,
    volume_ramp: 0,
    offset: 0,
    attack: 0,
    decay: 0.025,
    sustain: 0.05,
    release: 0.025,
    level: 0.5,
  },
  pitch: {
    frequency: A[4],
    frequency_ramp: 0,
    frequency_torque: 0,
    frequency_jerk: 0,
    phase: 0,
  },
  lowpass: {
    cutoff: 0,
    cutoff_ramp: 0,
    resonance: 0,
  },
  highpass: {
    cutoff: 0,
    cutoff_ramp: 0,
  },
  distortion: {
    on: false,
    edge: 0.5,
    edge_ramp: 0,
    grit: 0,
    grit_ramp: 0,
  },
  arpeggio: {
    on: false,
    rate: 12,
    rate_ramp: 0,
    max_octaves: 1,
    max_notes: 160,
    direction: "up",
    tones: [],
    levels: [],
    shapes: [],
  },
  vibrato: {
    on: false,
    shape: "sine",
    strength: 0.5,
    strength_ramp: 0,
    rate: 6,
    rate_ramp: 0,
  },
  tremolo: {
    on: false,
    shape: "sine",
    strength: 0.5,
    strength_ramp: 0,
    rate: 12,
    rate_ramp: 0,
  },
  wahwah: {
    on: false,
    shape: "sine",
    strength: 0.5,
    strength_ramp: 0,
    rate: 6,
    rate_ramp: 0,
  },
  reverb: {
    on: false,
    level: 0.5,
    delay: 0.15,
  },
});
