export const fillArraysWithReverberation = (
  buffers: [Float32Array, Float32Array],
  startIndex: number,
  endIndex: number = buffers[0].length - 1
): void => {
  for (let i = startIndex; i < endIndex; i += 1) {
    if (i / endIndex < Math.random()) {
      buffers[0][i] =
        Math.exp((-3 * i) / endIndex) * (Math.random() - 0.5) * 0.5;
      buffers[1][i] =
        Math.exp((-3 * i) / endIndex) * (Math.random() - 0.5) * 0.5;
    }
  }
};
