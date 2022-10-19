import { getCleanedWords } from "./getCleanedWords";

export const getKeywords = (
  phrases: string[],
  sort = false
): { [word: string]: number } => {
  const keywords: { [word: string]: number } = {};

  phrases.forEach((phrase) => {
    const words = getCleanedWords(phrase);
    words.forEach((word) => {
      keywords[word] = (keywords[word] || 0) + 1;
    });
  });

  if (sort) {
    const sortedEntries = Object.entries(keywords).sort(
      ([, aValue], [, bValue]) => {
        return bValue - aValue;
      }
    );
    const sortedDict = {};
    sortedEntries.forEach(([key, value]) => {
      sortedDict[key] = value;
    });
    return sortedDict;
  }

  return keywords;
};
