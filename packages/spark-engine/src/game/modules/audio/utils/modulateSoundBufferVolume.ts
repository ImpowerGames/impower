export const modulateSoundBufferVolume = (
  soundBuffer: Float32Array,
  volume: number
): void => {
  for (let i = 0; i < soundBuffer.length; i += 1) {
    let v = soundBuffer[i] ?? 0;
    v *= volume;
    soundBuffer[i] = v;
  }
};
