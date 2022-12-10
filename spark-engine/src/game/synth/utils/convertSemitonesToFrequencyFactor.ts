export const convertSemitonesToFrequencyFactor = (interval: number): number => {
  return Math.pow(2, interval / 12);
};
