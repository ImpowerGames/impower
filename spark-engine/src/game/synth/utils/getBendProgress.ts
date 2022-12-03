export const getBendProgress = (
  i: number,
  startIndex: number,
  endIndex: number
): number => {
  const length = endIndex - startIndex;
  const midIndex = startIndex + length / 2;
  const progressAfterMid = (i - midIndex) / length;
  return progressAfterMid < 0 ? 0 : progressAfterMid;
};
