const shuffle = <T>(array: T[], rng?: () => number): T[] => {
  const newArray = [...array];
  let currentIndex = newArray.length;
  let temporaryValue;
  let randomIndex;

  while (currentIndex !== 0) {
    const random = rng ? rng() : Math.random();
    randomIndex = Math.floor(random * currentIndex);
    currentIndex -= 1;

    temporaryValue = newArray[currentIndex];
    newArray[currentIndex] = newArray[randomIndex] as T;
    newArray[randomIndex] = temporaryValue as T;
  }

  return newArray;
};

export default shuffle;
