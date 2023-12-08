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
  const time = tone.time ?? 0;
  const duration = tone.duration ?? 0;
  const volume = tone.velocity ?? 1;
  const synth = clone(_synth(), tone.synth);
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
