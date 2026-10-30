import { getCleanedWords } from "../utils/getCleanedWords";
import { getSubphrases } from "../utils/getSubphrases";

export const getTermRelevancyScore = (
  phrase: string,
  tagsSortedBySpecificity: string[],
  termTagsMap: {
    [term: string]: string[];
  },
): number => {
  const matchedTags: string[] = [];
  const words = getCleanedWords(phrase);
  const subphrases = getSubphrases(words);
  let relevantTermWeight = 0;
  let termCount = 0;
  subphrases.forEach((subphrase) => {
    const termTags = termTagsMap[subphrase];
    if (termTags && termTags.length > 0) {
      termCount += 1;
      const tagMatchIndex = tagsSortedBySpecificity.findIndex(
        (tag) =>
          (subphrase === tag?.toLowerCase() || termTags.includes(tag)) &&
          (tagsSortedBySpecificity.length === 1 || !matchedTags.includes(tag)),
      );
      if (tagMatchIndex >= 0) {
        const match = tagsSortedBySpecificity[tagMatchIndex];
        if (match) {
          matchedTags.push(match);
          const max = tagsSortedBySpecificity.length;
          const weight = (max - tagMatchIndex) / max;
          relevantTermWeight += weight;
        }
      }
    }
  });
  const score = relevantTermWeight / Math.min(termCount, words.length);
  if (matchedTags.length > 1) {
    return score;
  }
  return score * 0.5;
};

const getRelevantPhrases = (
  tagsSortedBySpecificity: string[],
  tagPhrasesMap: {
    [tag: string]: string[];
  },
  termTagsMap: {
    [term: string]: string[];
  },
  limit?: number,
): [string, number][] => {
  const phraseRelevancyScoreMap: { [phrase: string]: number } = {};

  if (!tagsSortedBySpecificity || tagsSortedBySpecificity.length === 0) {
    return [];
  }

  const primaryTagIndex = tagsSortedBySpecificity.findIndex(
    (tag) => tagPhrasesMap[tag]?.length || 0 > 0,
  );
  if (primaryTagIndex >= 0) {
    const primaryTag = tagsSortedBySpecificity[primaryTagIndex] || "";
    const primaryTagPhrases = tagPhrasesMap[primaryTag];

    tagsSortedBySpecificity.forEach((tag, index) => {
      const tagPhrases = tagPhrasesMap[tag];
      if (tagPhrases) {
        tagPhrases.forEach((p) => {
          if (primaryTagPhrases?.includes(p)) {
            if (phraseRelevancyScoreMap[p] === undefined) {
              phraseRelevancyScoreMap[p] = getTermRelevancyScore(
                p,
                tagsSortedBySpecificity,
                termTagsMap,
              );
            }
            const max = tagsSortedBySpecificity.length;
            const weight = (max - index) / max;
            phraseRelevancyScoreMap[p] += weight;
          }
        });
      }
    });
  }

  const sortedPhrases = Object.entries(phraseRelevancyScoreMap).sort(
    ([aPhrase], [bPhrase]) => {
      const aScore = phraseRelevancyScoreMap[aPhrase] || 0;
      const bScore = phraseRelevancyScoreMap[bPhrase] || 0;
      return bScore - aScore;
    },
  );

  if (limit) {
    return sortedPhrases.slice(0, limit * (1 / tagsSortedBySpecificity.length));
  }
  return sortedPhrases;
};

export default getRelevantPhrases;
