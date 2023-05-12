import { getCleanedWords } from "../utils/getCleanedWords";
import getSubphrases from "./getSubphrases";

/**
 * Get a score that represents the proportion of terms in the phrase that are relevant
 *
 * @returns The term relevancy score
 */
export const getTermRelevancyScore = (
  phrase: string,
  tagsSortedBySpecificity: string[],
  termTagsMap: {
    [term: string]: string[];
  }
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
          (tagsSortedBySpecificity.length === 1 || !matchedTags.includes(tag))
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
  // Phrase must have at least 2 unique relevant terms to benefit fully from this bonus
  // (This is because we need at least 2 relevant ideas for a double-entendre)
  const score = relevantTermWeight / Math.min(termCount, words.length);
  if (matchedTags.length > 1) {
    return score;
  }
  return score * 0.5;
};

/**
 * Suggest phrases that are relevant to a concept.
 * (These phrases can be used as clever titles or as brainstorming concepts that may spark the user's imagination.)
 *
 * @param tagsSortedBySpecificity An array of tags that describe the concept (sorted by which should influence the generator more)
 * @param relatedPhrasesSortedByLength A map of tags -> related phrases (each tag's phrase list should be sorted by length in ascending order: shortest to longest)
 *
 * @returns A list of (at most) 200 phrases ranked by relevancy to the concept
 */
const getRelevantPhrases = (
  tagsSortedBySpecificity: string[],
  tagPhrasesMap: {
    [tag: string]: string[];
  },
  termTagsMap: {
    [term: string]: string[];
  },
  limit?: number
): [string, number][] => {
  const phraseRelevancyScoreMap: { [phrase: string]: number } = {};

  if (!tagsSortedBySpecificity || tagsSortedBySpecificity.length === 0) {
    return [];
  }

  const primaryTagIndex = tagsSortedBySpecificity.findIndex(
    (tag) => tagPhrasesMap[tag]?.length || 0 > 0
  );
  if (primaryTagIndex >= 0) {
    const primaryTag = tagsSortedBySpecificity[primaryTagIndex] || "";
    const primaryTagPhrases = tagPhrasesMap[primaryTag];

    tagsSortedBySpecificity.forEach((tag, index) => {
      // Get all phrases that are related to this tag.
      const tagPhrases = tagPhrasesMap[tag];
      if (tagPhrases) {
        tagPhrases.forEach((p) => {
          // All suggested phrases must at least satisfy the first (primary/most specific) tag.
          if (primaryTagPhrases?.includes(p)) {
            if (phraseRelevancyScoreMap[p] === undefined) {
              phraseRelevancyScoreMap[p] = getTermRelevancyScore(
                p,
                tagsSortedBySpecificity,
                termTagsMap
              );
            }
            // The increment value is weighted by how specific the tag is.
            // A more specific tag (e.g. "vampire") will have more weight than a more general tag (e.g. "conversation").
            // This is because specific tags like "vampire" typically have stronger associated terms ("blood", "fangs", "dead")
            // and thus more "pun potential".
            const max = tagsSortedBySpecificity.length;
            const weight = (max - index) / max;
            phraseRelevancyScoreMap[p] += weight;
          }
        });
      }
    });
  }

  // Sort phrases by tag relevancy score and term relevancy score.
  // Generally, the more tags a phrase is related to
  // and the more words in the phrase that are relevant,
  // the higher it will rank.
  // (We like titles that work on multiple levels!)
  const sortedPhrases = Object.entries(phraseRelevancyScoreMap).sort(
    ([aPhrase], [bPhrase]) => {
      const aScore = phraseRelevancyScoreMap[aPhrase] || 0;
      const bScore = phraseRelevancyScoreMap[bPhrase] || 0;
      return bScore - aScore;
    }
  );

  if (limit) {
    // If the user provides more tags, suggest less phrases.
    return sortedPhrases.slice(0, limit * (1 / tagsSortedBySpecificity.length));
  }
  return sortedPhrases;
};

export default getRelevantPhrases;
