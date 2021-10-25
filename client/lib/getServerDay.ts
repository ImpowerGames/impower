export const getServerDay = (time: number): number => {
  return Math.trunc(time / 1000 / 60 / 60 / 24);
};
