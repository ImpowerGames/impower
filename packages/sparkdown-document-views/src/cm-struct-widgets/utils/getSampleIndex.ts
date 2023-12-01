export const getSampleIndex = (
  x: number,
  startX: number,
  endX: number,
  bufferLength: number
): number => {
  const timeProgress = (x - startX) / (endX - 1);
  return Math.floor(timeProgress * (bufferLength - 1));
};
