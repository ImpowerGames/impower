export const convertSemitonesToFrequencyFactor = (
  semitones: number
): number => {
  return Math.pow(2, semitones / 12);
};
