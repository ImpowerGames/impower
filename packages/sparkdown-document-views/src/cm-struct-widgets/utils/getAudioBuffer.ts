import type { SynthBuffer } from "../../../../spark-engine/src";

export const getAudioBuffer = async (
  sound: Float32Array | SynthBuffer | string,
  audioContext: AudioContext
): Promise<AudioBuffer | Float32Array | SynthBuffer> => {
  if (typeof sound === "string") {
    const response = await fetch(sound);
    const buffer = await response.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(buffer);
    return decoded;
  }
  return sound;
};
