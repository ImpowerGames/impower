import { CurveType } from "../../core";
import { EASE } from "../../core/constants/EASE";
import { CurveDirection, EaseType } from "../../core/types/EaseType";
import { interpolate } from "../../core/utils/interpolate";
import { Tone } from "../types/Tone";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { getToneIndices } from "./getToneIndices";
import { transpose } from "./transpose";

interface Keyframe {
  hertz: number;
  startIndex: number;
  endIndex: number;
  bend: number;
  pitchCurve?: CurveType;
}

const getMidIndex = (startIndex: number, endIndex: number): number =>
  Math.floor(startIndex + (endIndex - startIndex) * 0.5);

export const createFrequencyBuffers = (
  sampleRate: number,
  tones: readonly Tone[]
): Float32Array[] => {
  const buffers: Float32Array[] = [];

  const waveKeyframes: Keyframe[][] = [];

  let maxBufferIndex = 0;

  tones.forEach((tone) => {
    const [startIndex, endIndex] = getToneIndices(tone, sampleRate);
    if (tone.waves) {
      tone.waves.forEach((wave, waveIndex) => {
        if (!waveKeyframes[waveIndex]) {
          waveKeyframes[waveIndex] = [];
        }
        const note = wave?.note;
        const hertz = note ? convertNoteToHertz(note) : 0;
        const bend = wave.bend || 0;
        const keyframe: Keyframe = {
          hertz,
          startIndex,
          endIndex,
          bend,
          pitchCurve: bend ? "sine" : tone.pitchCurve,
        };
        waveKeyframes[waveIndex]?.push(keyframe);
      });
    }
    if (endIndex > maxBufferIndex) {
      maxBufferIndex = endIndex;
    }
  });

  for (let waveIndex = 0; waveIndex < waveKeyframes.length; waveIndex += 1) {
    const keyframes = waveKeyframes[waveIndex];
    const buffer = buffers[waveIndex] || new Float32Array(maxBufferIndex + 1);
    buffers[waveIndex] = buffer;
    if (keyframes) {
      keyframes.forEach(
        ({ hertz, startIndex, endIndex, pitchCurve, bend }, i) => {
          const midIndex = getMidIndex(startIndex, endIndex);

          const nextKeyframe = keyframes?.[i + 1];
          const nextHertz = nextKeyframe ? nextKeyframe.hertz : hertz;

          const direction =
            bend || Math.max(-1, Math.min(nextHertz - hertz, 1));
          const bentHertz = transpose(hertz, direction);

          const nextStartIndex = nextKeyframe
            ? nextKeyframe.startIndex
            : Math.max(buffer.length + (endIndex - startIndex), endIndex + 1);

          for (let i = startIndex; i < endIndex; i += 1) {
            if (!pitchCurve || i < midIndex) {
              buffer[i] = hertz;
            } else {
              const progress = (i - midIndex) / (nextStartIndex - midIndex);
              const direction: CurveDirection = "InOut";
              const easeType: EaseType =
                pitchCurve === "linear"
                  ? pitchCurve
                  : `${pitchCurve}${direction}`;
              const ease = EASE[easeType];
              const easedHertz = interpolate(progress, hertz, bentHertz, ease);
              buffer[i] = easedHertz;
            }
          }
        }
      );
    }
  }
  return buffers;
};
