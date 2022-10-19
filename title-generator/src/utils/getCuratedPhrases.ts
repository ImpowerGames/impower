import { getCleanedWords } from "./getCleanedWords";
import { getSortedMap } from "./getSortedMap";

export const getCuratedPhrases = (
  phrases: string[],
  termTags: { [tag: string]: string[] },
  consoleOutputPhrase = ""
) => {
  const associatedTags: { [phrase: string]: string[] } = {};

  const validConsoleOutputPhrase =
    consoleOutputPhrase ||
    phrases[Math.floor(Math.random() * (phrases.length - 1))];

  console.log(`"${validConsoleOutputPhrase}"`);

  phrases.forEach((phrase) => {
    const words = getCleanedWords(phrase);
    const subphrases = new Set<string>();
    for (let i = 0; i <= words.length; i += 1) {
      for (let j = 1; j <= words.length; j += 1) {
        const subphrase = words.slice(i, j).join(" ");
        if (subphrase) {
          subphrases.add(subphrase);
        }
      }
    }
    const phraseTags: string[] = [];
    subphrases.forEach((subphrase) => {
      const tagMatches = termTags[subphrase] || [];
      if (phrase === validConsoleOutputPhrase && tagMatches.length > 0) {
        console.log(subphrase, tagMatches);
      }
      phraseTags.push(...tagMatches);
    });
    const phraseAssociatedTags = associatedTags[phrase] || [];
    associatedTags[phrase] = phraseAssociatedTags;
    phraseAssociatedTags.push(...phraseTags);
  });

  return getSortedMap(associatedTags, true);
};
