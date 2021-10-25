export const getCurrentTimeInSeconds = (): number => {
  return Math.trunc(Date.now() / 1000);
};
