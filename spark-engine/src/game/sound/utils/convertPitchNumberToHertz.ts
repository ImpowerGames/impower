const A4 = 440; // A4 = 440Hz

export const convertPitchNumberToHertz = (
  note: number | undefined
): number | undefined => {
  if (note == null) {
    return note;
  }
  return (A4 / 32) * 2 ** ((note - 9) / 12);
};
