import { Tone } from "../types/Tone";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { synthesizeSound } from "./synthesizeSound";

export const fillArrayWithTones = (
  tones: readonly Tone[],
  sampleRate: number,
  soundBuffer: Float32Array,
  pitchBuffer?: Float32Array
): { minPitch: number; maxPitch: number } => {
  let minPitch = Number.MAX_SAFE_INTEGER;
  let maxPitch = 0;
  tones.forEach((tone) => {
    const sound = tone.sound;
    const time = tone.time || 0;
    const duration = tone.duration || 0;
    const volume = tone.velocity;
    const pitch = convertNoteToHertz(tone.note);
    if (sound && duration) {
      const startIndex = Math.floor(time * sampleRate);
      const endIndex = Math.floor((time + duration) * sampleRate);
      const { minPitch: soundMinPitch, maxPitch: soundMaxPitch } =
        synthesizeSound(
          sound,
          true,
          true,
          sampleRate,
          startIndex,
          endIndex,
          soundBuffer,
          pitchBuffer,
          volume,
          pitch
        );
      if (soundMinPitch < minPitch) {
        minPitch = soundMinPitch;
      }
      if (soundMaxPitch > maxPitch) {
        maxPitch = soundMaxPitch;
      }
    }
  });

  return {
    minPitch,
    maxPitch,
  };
};
