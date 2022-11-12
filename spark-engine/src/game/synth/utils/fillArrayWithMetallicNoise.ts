export const fillArrayWithMetallicNoise = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number = buffer.length - 1
): void => {
  for (let jj = 0; jj < 64; jj += 1) {
    const r1 = Math.random() * 10 + 1;
    const r2 = Math.random() * 10 + 1;
    for (let i = startIndex; i < endIndex; i += 1) {
      const dd =
        Math.sin((i / endIndex) * 2 * Math.PI * 440 * r1) *
        Math.sin((i / endIndex) * 2 * Math.PI * 440 * r2);
      buffer[i] += dd / 8;
    }
  }
};
