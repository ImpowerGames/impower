import { Synth } from "../types/Synth";
import { Tone } from "../types/Tone";
import { convertPitchNoteToHertz } from "./convertPitchNoteToHertz";
import { synthesizeSound } from "./synthesizeSound";
import { transpose } from "./transpose";

export const fillArrayWithTone = (
  tone: Tone,
  synth: Synth,
  sampleRate: number,
  soundBuffer: Float32Array,
  volumeBuffer?: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number]
): void => {
  const envelopeDuration =
    synth.envelope.attack +
    synth.envelope.decay +
    synth.envelope.sustain +
    synth.envelope.release;
  const time = tone.time ?? 0;
  const speed = tone.speed ?? 1;
  const duration = (tone.duration ?? envelopeDuration) / speed;
  const volume = tone.velocity ?? 1;
  const originalPitch =
    convertPitchNoteToHertz(tone.pitch) ?? synth?.pitch?.frequency ?? 440;
  const bend = tone.bend ?? 0;
  const pitch = transpose(originalPitch, bend);
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
