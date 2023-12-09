import { clone } from "../../core/utils/clone";
import { _synth } from "../specs/defaults/_synth";
import { Tone } from "../types/Tone";
import { convertPitchNoteToHertz } from "./convertPitchNoteToHertz";
import { convertPitchNumberToHertz } from "./convertPitchNumberToHertz";
import { synthesizeSound } from "./synthesizeSound";

export const fillArrayWithTone = (
  tone: Tone,
  sampleRate: number,
  soundBuffer: Float32Array,
  volumeBuffer?: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number]
): void => {
  const synth = clone(_synth(), tone.synth);
  const envelopeDuration =
    synth.envelope.attack +
    synth.envelope.decay +
    synth.envelope.sustain +
    synth.envelope.release;
  const time = tone.time ?? 0;
  const duration = tone.duration ?? envelopeDuration;
  const volume = tone.velocity ?? 1;
  const pitch =
    tone.pitchHertz ??
    convertPitchNoteToHertz(tone.pitchNote) ??
    convertPitchNumberToHertz(tone.pitchNumber) ??
    440;
  if (duration) {
    const startIndex = Math.floor(time * sampleRate);
    const endIndex = Math.floor((time + duration) * sampleRate);
    synthesizeSound(
      synth,
      true,
      true,
      sampleRate,
      startIndex,
      endIndex,
      soundBuffer,
      volumeBuffer,
      pitchBuffer,
      pitchRange,
      volume,
      pitch
    );
  }
};
