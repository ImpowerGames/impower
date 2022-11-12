export const fillArrayWithWhiteNoise = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number = buffer.length - 1
): void => {
  for (let i = startIndex; i < endIndex; i += 1) {
    buffer[i] = Math.random() * 2 - 1;
  }
};
