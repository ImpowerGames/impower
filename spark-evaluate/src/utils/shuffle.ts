export const shuffle = <T>(array: T[], rng?: () => number): T[] => {
  const newArray = [...array];
  let currentIndex = newArray.length;
  let temporaryValue;
  let randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex !== 0) {
    // Pick a remaining element...
    const random = rng ? rng() : Math.random();
    randomIndex = Math.floor(random * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = newArray[currentIndex];
    newArray[currentIndex] = newArray[randomIndex] as T;
    newArray[randomIndex] = temporaryValue as T;
  }

  return newArray;
};
