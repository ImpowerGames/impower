export const getClosestFractionalIndex = (
  keyTime: number,
  keyTimes: number[]
): number => {
  for (let i = 0; i < keyTimes.length; i += 1) {
    const t = keyTimes[i];
    if (t === keyTime) {
      return i;
    }
    if (t > keyTime) {
      const prevIndex = i - 1;
      const prevT = keyTimes[prevIndex];
      const remainder = keyTime - prevT;
      const fraction = remainder / (t - prevT);
      return prevIndex + fraction;
    }
  }
  return keyTimes.length;
};
