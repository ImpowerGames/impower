import { Tone } from "../types/Tone";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { synthesizeSound } from "./synthesizeSound";

export const fillArrayWithTones = (
  tones: readonly Tone[],
  sampleRate: number,
  soundBuffer: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number]
): void => {
  tones.forEach((tone) => {
    const sound = tone.sound;
    const time = tone.time || 0;
    const duration = tone.duration || 0;
    const volume = tone.velocity;
    const pitch = convertNoteToHertz(tone.note);
    if (sound && duration) {
      const startIndex = Math.floor(time * sampleRate);
      const endIndex = Math.floor((time + duration) * sampleRate);
      synthesizeSound(
        sound,
        true,
        true,
        sampleRate,
        startIndex,
        endIndex,
        soundBuffer,
        pitchBuffer,
        pitchRange,
        volume,
        pitch
      );
    }
  });
};
