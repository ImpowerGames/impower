export const getTo = (
  from: number,
  content: string,
  newLineLength: number
): number => {
  return from + content.length - 1 + newLineLength;
};
