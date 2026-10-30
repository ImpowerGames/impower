import { getSubphrases } from "../utils/getSubphrases";

const getPhraseTagsMap = (
  phrases: string[],
  termTagsMap: { [term: string]: string[] },
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
