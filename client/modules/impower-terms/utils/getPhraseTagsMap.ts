import getSubphrases from "./getSubphrases";

/**
 * Get all tags associated with a phrase
 *
 * @param phrase The phrase
 * @param termTagsMap A map of terms -> tags related to that term
 *
 * @returns A map of phrases -> tags related to that phrase
 */
const getPhraseTagsMap = (
  phrases: string[],
  termTagsMap: { [term: string]: string[] }
): {
  [phrase: string]: string[];
} => {
  const phraseTagsMap: { [phrase: string]: string[] } = {};

  phrases.forEach((phrase) => {
    getSubphrases(phrase).forEach((term) => {
      const termTags = termTagsMap[term];
      if (termTags) {
        if (!phraseTagsMap[phrase]) {
          phraseTagsMap[phrase] = [];
        }
        if (!phraseTagsMap[phrase].includes(term)) {
          phraseTagsMap[phrase].push(term);
        }
        phraseTagsMap[phrase].push(
          ...termTags.filter((tag) => !phraseTagsMap[phrase].includes(tag))
        );
      }
    });
  });

  return phraseTagsMap;
};

export default getPhraseTagsMap;
