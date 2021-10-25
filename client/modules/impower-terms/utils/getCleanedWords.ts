const getCleanedWords = (phrase: string): string[] => {
  return phrase
    .toLowerCase()
    .replace(/["$%&\\()*,.:;<=>[\\\]^_`{|}~-]/g, " ")
    .replace(/[+]/g, " + ")
    .replace(/[!]/g, " ! ")
    .replace(/[?]/g, " ? ")
    .split(" ")
    .filter((w) => Boolean(w));
};

export default getCleanedWords;
