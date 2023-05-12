import { getCleanedWords } from "./getCleanedWords";

export const getKeyphrases = (
  phrases: string[],
  sort = false
): { [word: string]: number } => {
  const subphrases: { [subphrase: string]: number } = {};

  phrases.forEach((phrase) => {
    const words = getCleanedWords(phrase);
    for (let i = 0; i <= words.length; i += 1) {
      for (let j = 1; j <= words.length; j += 1) {
        const subphrase = words.slice(i, j).join(" ");
        if (subphrase) {
          subphrases[subphrase] = (subphrases[subphrase] || 0) + 1;
        }
      }
    }
  });

  if (sort) {
    const sortedEntries = Object.entries(subphrases).sort(
      ([, aValue], [, bValue]) => {
        return bValue - aValue;
      }
    );
    const sortedDict: { [word: string]: number } = {};
    sortedEntries.forEach(([key, value]) => {
      sortedDict[key] = value;
    });
    return sortedDict;
  }

  return subphrases;
};
