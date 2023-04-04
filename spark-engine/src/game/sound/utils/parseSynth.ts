import { SynthConfig } from "../types/Synth";
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
        } else if (synth.envelope.volumeRamp === undefined) {
          synth.envelope.volumeRamp = Number(t);
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
        } else if (synth.pitch.frequencyRamp === undefined) {
          synth.pitch.frequencyRamp = Number(t);
        } else if (synth.pitch.frequencyTorque === undefined) {
          synth.pitch.frequencyTorque = Number(t);
        } else if (synth.pitch.frequencyJerk === undefined) {
          synth.pitch.frequencyJerk = Number(t);
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
        } else if (synth.lowpass.cutoffRamp === undefined) {
          synth.lowpass.cutoffRamp = Number(t);
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
        } else if (synth.highpass.cutoffRamp === undefined) {
          synth.highpass.cutoffRamp = Number(t);
        }
      }
      if (command === "D") {
        if (!synth.distortion) {
          synth.distortion = { on: true };
        }
        if (synth.distortion.grit === undefined) {
          synth.distortion.grit = Number(t);
        } else if (synth.distortion.gritRamp === undefined) {
          synth.distortion.gritRamp = Number(t);
        } else if (synth.distortion.edge === undefined) {
          synth.distortion.edge = Number(t);
        } else if (synth.distortion.edgeRamp === undefined) {
          synth.distortion.edgeRamp = Number(t);
        }
      }
      if (command === "A") {
        if (!synth.arpeggio) {
          synth.arpeggio = { on: true };
        }
        if (synth.arpeggio.rate === undefined) {
          synth.arpeggio.rate = Number(t);
        } else if (synth.arpeggio.rateRamp === undefined) {
          synth.arpeggio.rateRamp = Number(t);
        } else if (synth.arpeggio.maxOctaves === undefined) {
          synth.arpeggio.maxOctaves = Number(t);
        } else if (synth.arpeggio.maxNotes === undefined) {
          synth.arpeggio.maxNotes = Number(t);
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
        } else if (synth.vibrato.rateRamp === undefined) {
          synth.vibrato.rateRamp = Number(t);
        } else if (synth.vibrato.strength === undefined) {
          synth.vibrato.strength = Number(t);
        } else if (synth.vibrato.strengthRamp === undefined) {
          synth.vibrato.strengthRamp = Number(t);
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
        } else if (synth.tremolo.rateRamp === undefined) {
          synth.tremolo.rateRamp = Number(t);
        } else if (synth.tremolo.strength === undefined) {
          synth.tremolo.strength = Number(t);
        } else if (synth.tremolo.strengthRamp === undefined) {
          synth.tremolo.strengthRamp = Number(t);
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
        } else if (synth.wahwah.rateRamp === undefined) {
          synth.wahwah.rateRamp = Number(t);
        } else if (synth.wahwah.strength === undefined) {
          synth.wahwah.strength = Number(t);
        } else if (synth.wahwah.strengthRamp === undefined) {
          synth.wahwah.strengthRamp = Number(t);
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
