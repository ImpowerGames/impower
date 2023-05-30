export const unlerp = (value: number, min: number, max: number) => {
  return (value - min) / (max - min);
};
