export const pick = <T>(array: T[], rng?: () => number): T => {
  let currentIndex = array.length;
  const r = rng || Math.random;
  const randomIndex = Math.floor(r() * currentIndex);
  return array[randomIndex] as T;
};
