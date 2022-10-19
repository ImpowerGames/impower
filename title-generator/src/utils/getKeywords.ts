import { getCleanedWords } from "./getCleanedWords";

export const getKeywords = (
  phrases: string[],
  sort = false
): Record<string, number> => {
  const keywords: Record<string, number> = {};

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
    const sortedDict: Record<string, number> = {};
    sortedEntries.forEach(([key, value]) => {
      sortedDict[key] = value;
    });
    return sortedDict;
  }

  return keywords;
};
