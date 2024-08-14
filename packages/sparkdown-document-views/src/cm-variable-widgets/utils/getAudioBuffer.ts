import type { SynthBuffer } from "../../../../spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";

export const getAudioBuffer = async (
  sound: Float32Array | SynthBuffer | string | undefined,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  if (typeof sound === "string") {
    const response = await fetch(sound);
    const buffer = await response.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(buffer);
    return decoded;
  }
  if (sound && "soundBuffer" in sound) {
    const audioBuffer = audioContext.createBuffer(
      1,
      sound.soundBuffer.length,
      audioContext.sampleRate
    );
    audioBuffer.copyToChannel(sound.soundBuffer, 0);
    return audioBuffer;
  }
  return audioContext.createBuffer(1, 1, audioContext.sampleRate);
};
