import { getSubphrases } from "../utils/getSubphrases";

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
        const tags = phraseTagsMap[phrase];
        if (tags) {
          if (!tags.includes(term)) {
            tags.push(term);
          }
          tags.push(...termTags.filter((tag) => !tags.includes(tag)));
        }
      }
    });
  });

  return phraseTagsMap;
};

export default getPhraseTagsMap;
