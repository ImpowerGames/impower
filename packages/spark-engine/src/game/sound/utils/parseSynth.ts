import { SynthConfig } from "../specs/Synth";
import { parseArpeggioDirection } from "./parseArpeggioDirection";
import { parseOscillatorType } from "./parseOscillatorType";

const commands = ["S", "E", "P", "L", "H", "D", "A", "a", "V", "T", "R"];

export const parseSynth = (markup: string): SynthConfig => {
  const synth: SynthConfig = {};
  let command = "";
  const tokens = markup.split(" ");
  let arpIndex = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t && commands.includes(t)) {
      command = t;
      if (command === "a") {
        arpIndex += 1;
      }
    } else {
      if (command === "S") {
        if (synth.shape === undefined) {
          synth.shape = parseOscillatorType(t);
        }
      }
      if (command === "E") {
        if (!synth.envelope) {
          synth.envelope = {};
        }
        if (synth.envelope.volume === undefined) {
          synth.envelope.volume = Number(t);
        } else if (synth.envelope.volume_ramp === undefined) {
          synth.envelope.volume_ramp = Number(t);
        } else if (synth.envelope.offset === undefined) {
          synth.envelope.offset = Number(t);
        } else if (synth.envelope.attack === undefined) {
          synth.envelope.attack = Number(t);
        } else if (synth.envelope.decay === undefined) {
          synth.envelope.decay = Number(t);
        } else if (synth.envelope.sustain === undefined) {
          synth.envelope.sustain = Number(t);
        } else if (synth.envelope.release === undefined) {
          synth.envelope.release = Number(t);
        } else if (synth.envelope.level === undefined) {
          synth.envelope.level = Number(t);
        }
      }
      if (command === "P") {
        if (!synth.pitch) {
          synth.pitch = {};
        }
        if (synth.pitch.frequency === undefined) {
          synth.pitch.frequency = Number(t);
        } else if (synth.pitch.frequency_ramp === undefined) {
          synth.pitch.frequency_ramp = Number(t);
        } else if (synth.pitch.frequency_torque === undefined) {
          synth.pitch.frequency_torque = Number(t);
        } else if (synth.pitch.frequency_jerk === undefined) {
          synth.pitch.frequency_jerk = Number(t);
        } else if (synth.pitch.phase === undefined) {
          synth.pitch.phase = Number(t);
        }
      }
      if (command === "L") {
        if (!synth.lowpass) {
          synth.lowpass = {};
        }
        if (synth.lowpass.cutoff === undefined) {
          synth.lowpass.cutoff = Number(t);
        } else if (synth.lowpass.cutoff_ramp === undefined) {
          synth.lowpass.cutoff_ramp = Number(t);
        } else if (synth.lowpass.resonance === undefined) {
          synth.lowpass.resonance = Number(t);
        }
      }
      if (command === "H") {
        if (!synth.highpass) {
          synth.highpass = {};
        }
        if (synth.highpass.cutoff === undefined) {
          synth.highpass.cutoff = Number(t);
        } else if (synth.highpass.cutoff_ramp === undefined) {
          synth.highpass.cutoff_ramp = Number(t);
        }
      }
      if (command === "D") {
        if (!synth.distortion) {
          synth.distortion = { on: true };
        }
        if (synth.distortion.grit === undefined) {
          synth.distortion.grit = Number(t);
        } else if (synth.distortion.grit_ramp === undefined) {
          synth.distortion.grit_ramp = Number(t);
        } else if (synth.distortion.edge === undefined) {
          synth.distortion.edge = Number(t);
        } else if (synth.distortion.edge_ramp === undefined) {
          synth.distortion.edge_ramp = Number(t);
        }
      }
      if (command === "A") {
        if (!synth.arpeggio) {
          synth.arpeggio = { on: true };
        }
        if (synth.arpeggio.rate === undefined) {
          synth.arpeggio.rate = Number(t);
        } else if (synth.arpeggio.rate_ramp === undefined) {
          synth.arpeggio.rate_ramp = Number(t);
        } else if (synth.arpeggio.max_octaves === undefined) {
          synth.arpeggio.max_octaves = Number(t);
        } else if (synth.arpeggio.max_notes === undefined) {
          synth.arpeggio.max_notes = Number(t);
        } else if (synth.arpeggio.direction === undefined) {
          synth.arpeggio.direction = parseArpeggioDirection(t);
        }
      }
      if (command === "a") {
        if (!synth.arpeggio) {
          synth.arpeggio = { on: true };
        }
        if (!synth.arpeggio.tones) {
          synth.arpeggio.tones = [];
        }
        if (!synth.arpeggio.levels) {
          synth.arpeggio.levels = [];
        }
        if (!synth.arpeggio.shapes) {
          synth.arpeggio.shapes = [];
        }
        if (t && (t.startsWith("-") || t.startsWith("+"))) {
          synth.arpeggio.tones[arpIndex] = Number(t);
        } else if (!Number.isNaN(Number(t))) {
          synth.arpeggio.levels[arpIndex] = Number(t);
        } else {
          const shape = parseOscillatorType(t);
          if (shape) {
            synth.arpeggio.shapes[arpIndex] = shape;
          }
        }
      }
      if (command === "V") {
        if (!synth.vibrato) {
          synth.vibrato = { on: true };
        }
        if (synth.vibrato.shape === undefined) {
          synth.vibrato.shape = parseOscillatorType(t);
        } else if (synth.vibrato.rate === undefined) {
          synth.vibrato.rate = Number(t);
        } else if (synth.vibrato.rate_ramp === undefined) {
          synth.vibrato.rate_ramp = Number(t);
        } else if (synth.vibrato.strength === undefined) {
          synth.vibrato.strength = Number(t);
        } else if (synth.vibrato.strength_ramp === undefined) {
          synth.vibrato.strength_ramp = Number(t);
        }
      }
      if (command === "T") {
        if (!synth.tremolo) {
          synth.tremolo = { on: true };
        }
        if (synth.tremolo.shape === undefined) {
          synth.tremolo.shape = parseOscillatorType(t);
        } else if (synth.tremolo.rate === undefined) {
          synth.tremolo.rate = Number(t);
        } else if (synth.tremolo.rate_ramp === undefined) {
          synth.tremolo.rate_ramp = Number(t);
        } else if (synth.tremolo.strength === undefined) {
          synth.tremolo.strength = Number(t);
        } else if (synth.tremolo.strength_ramp === undefined) {
          synth.tremolo.strength_ramp = Number(t);
        }
      }
      if (command === "W") {
        if (!synth.wahwah) {
          synth.wahwah = { on: true };
        }
        if (synth.wahwah.shape === undefined) {
          synth.wahwah.shape = parseOscillatorType(t);
        } else if (synth.wahwah.rate === undefined) {
          synth.wahwah.rate = Number(t);
        } else if (synth.wahwah.rate_ramp === undefined) {
          synth.wahwah.rate_ramp = Number(t);
        } else if (synth.wahwah.strength === undefined) {
          synth.wahwah.strength = Number(t);
        } else if (synth.wahwah.strength_ramp === undefined) {
          synth.wahwah.strength_ramp = Number(t);
        }
      }
      if (command === "R") {
        if (!synth.reverb) {
          synth.reverb = { on: true };
        }
        if (synth.reverb.level === undefined) {
          synth.reverb.level = Number(t);
        } else if (synth.reverb.delay === undefined) {
          synth.reverb.delay = Number(t);
        }
      }
    }
  }
  return synth;
};
