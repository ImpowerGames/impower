export const pick = <T>(array: T[], randomizer?: () => number): T => {
  let currentIndex = array.length;
  const random = randomizer ? randomizer() : Math.random();
  const randomIndex = Math.floor(random * currentIndex);
  return array[randomIndex] as T;
};
