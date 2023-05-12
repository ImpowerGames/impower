import { getCleanedWords } from "./getCleanedWords";

/**
 * Break a phrase into subphrases
 *
 * @param phrase The phrase to break into subphrases
 *
 * @returns An array of subphrases
 */
export const getSubphrases = (phrase: string | string[]): string[] => {
  const words = Array.isArray(phrase) ? phrase : getCleanedWords(phrase);
  const subphrases = new Set<string>();
  for (let i = 0; i <= words.length; i += 1) {
    for (let j = 1; j <= words.length; j += 1) {
      const subphrase = words.slice(i, j).join(" ");
      if (subphrase) {
        subphrases.add(subphrase);
      }
    }
  }
  return Array.from(subphrases);
};
