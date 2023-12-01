import { clone } from "../../core/utils/clone";
import { _synth } from "../specs/defaults/_synth";
import { SynthConfig } from "../specs/Synth";
import { stringifyArpeggioDirection } from "./stringifyArpeggioDirection";
import { stringifyOscillatorType } from "./stringifyOscillatorType";

export const stringifySynth = (config: SynthConfig): string => {
  const synth = clone(_synth(), config);
  let str = "";
  if (synth.shape) {
    str += " " + "S";
    str += " " + stringifyOscillatorType(synth.shape);
  }
  if (synth.envelope) {
    str += " " + "E";
    str += " " + synth.envelope.volume;
    str += " " + synth.envelope.volume_ramp;
    str += " " + synth.envelope.offset;
    str += " " + synth.envelope.attack;
    str += " " + synth.envelope.decay;
    str += " " + synth.envelope.sustain;
    str += " " + synth.envelope.release;
    str += " " + synth.envelope.level;
  }
  if (synth.pitch) {
    str += " " + "P";
    str += " " + synth.pitch.frequency;
    str += " " + synth.pitch.frequency_ramp;
    str += " " + synth.pitch.frequency_torque;
    str += " " + synth.pitch.frequency_jerk;
    str += " " + synth.pitch.phase;
  }
  if (synth.lowpass.cutoff) {
    str += " " + "L";
    str += " " + synth.lowpass.cutoff;
    str += " " + synth.lowpass.cutoff_ramp;
    str += " " + synth.lowpass.resonance;
  }
  if (synth.highpass.cutoff) {
    str += " " + "H";
    str += " " + synth.highpass.cutoff;
    str += " " + synth.highpass.cutoff_ramp;
  }
  if (synth.distortion.on) {
    str += " " + "D";
    str += " " + synth.distortion.grit;
    str += " " + synth.distortion.grit_ramp;
    str += " " + synth.distortion.edge;
    str += " " + synth.distortion.edge_ramp;
  }
  if (synth.arpeggio.on) {
    str += " " + "A";
    str += " " + synth.arpeggio.rate;
    str += " " + synth.arpeggio.rate_ramp;
    str += " " + synth.arpeggio.max_octaves;
    str += " " + synth.arpeggio.max_notes;
    str += " " + stringifyArpeggioDirection(synth.arpeggio.direction);
    const maxArpeggioLength = Math.max(
      synth.arpeggio.tones.length,
      synth.arpeggio.shapes.length,
      synth.arpeggio.levels.length
    );
    for (let i = 0; i < maxArpeggioLength; i += 1) {
      str += " " + "a";
      const shape = synth.arpeggio.shapes[i];
      const tone = synth.arpeggio.tones[i];
      const level = synth.arpeggio.levels[i];
      if (shape != null) {
        str += " " + stringifyOscillatorType(shape);
      }
      if (tone != null) {
        if (tone < 0) {
          str += " " + tone;
        } else {
          str += " " + "+" + tone;
        }
      }
      if (level != null) {
        str += " " + level;
      }
    }
  }
  if (synth.vibrato.on) {
    str += " " + "V";
    str += " " + stringifyOscillatorType(synth.vibrato.shape);
    str += " " + synth.vibrato.rate;
    str += " " + synth.vibrato.rate_ramp;
    str += " " + synth.vibrato.strength;
    str += " " + synth.vibrato.strength_ramp;
  }
  if (synth.tremolo.on) {
    str += " " + "T";
    str += " " + stringifyOscillatorType(synth.tremolo.shape);
    str += " " + synth.tremolo.rate;
    str += " " + synth.tremolo.rate_ramp;
    str += " " + synth.tremolo.strength;
    str += " " + synth.tremolo.strength_ramp;
  }
  if (synth.wahwah.on) {
    str += " " + "W";
    str += " " + stringifyOscillatorType(synth.wahwah.shape);
    str += " " + synth.wahwah.rate;
    str += " " + synth.wahwah.rate_ramp;
    str += " " + synth.wahwah.strength;
    str += " " + synth.wahwah.strength_ramp;
  }
  if (synth.reverb.on) {
    str += " " + "R";
    str += " " + synth.reverb.level;
    str += " " + synth.reverb.delay;
  }
  return str.trim();
};
