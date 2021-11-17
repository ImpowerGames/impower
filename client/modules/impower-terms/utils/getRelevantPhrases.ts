import getCleanedWords from "./getCleanedWords";
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
  const matchedTags = new Set<string>();
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
          !matchedTags.has(tag)
      );
      if (tagMatchIndex >= 0) {
        matchedTags.add(tagsSortedBySpecificity[tagMatchIndex]);
        const max = tagsSortedBySpecificity.length;
        const weight = (max - tagMatchIndex) / max;
        relevantTermWeight += weight;
      }
    }
  });
  // Phrase must have at least 2 unique relevant terms to benefit from this bonus
  // (This is because we need at least 2 relevant ideas for a double-entendre)
  if (tagsSortedBySpecificity.length === 1 || matchedTags.size > 1) {
    return relevantTermWeight / termCount;
  }
  return 0;
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
  limit = 200
): string[] => {
  const phraseTagRelevancyScoreMap: { [phrase: string]: number } = {};

  if (!tagsSortedBySpecificity || tagsSortedBySpecificity.length === 0) {
    return [];
  }

  const primaryTag = tagsSortedBySpecificity[0];
  const primaryTagPhrases = tagPhrasesMap[primaryTag];

  tagsSortedBySpecificity.forEach((tag, index) => {
    // Get all phrases that are related to this tag.
    // (For best results, ensure these phrases are sorted by length:
    // shorter, snappier phrases are generally perceived as more clever)
    const tagPhrases = tagPhrasesMap[tag];
    if (tagPhrases) {
      tagPhrases.forEach((p) => {
        const currentTagScore = phraseTagRelevancyScoreMap[p] || 0;
        // All suggested phrases must at least satisfy the first (primary/most specific) tag.
        if (primaryTagPhrases?.includes(p)) {
          // The increment value is weighted by how specific the tag is.
          // A more specific tag (e.g. "vampire") will have more weight than a more general tag (e.g. "conversation").
          // This is because specific tags like "vampire" typically have stronger associated terms ("blood", "fangs", "dead")
          // and thus more "pun potential".
          const max = tagsSortedBySpecificity.length;
          const weight = (max - index) / max;
          phraseTagRelevancyScoreMap[p] = currentTagScore + weight;
        }
      });
    }
  });

  // Sort phrases by tag relevancy score and term relevancy score.
  // Generally, the more tags a phrase is related to
  // and the more words in the phrase that are relevant,
  // the higher it will rank.
  // (We like titles that work on multiple levels!)
  const sortedPhrases = Object.keys(phraseTagRelevancyScoreMap).sort(
    (aPhrase, bPhrase) => {
      const aTagScore = phraseTagRelevancyScoreMap[aPhrase] || 0;
      const aTermScore = getTermRelevancyScore(
        aPhrase,
        tagsSortedBySpecificity,
        termTagsMap
      );
      const aScore = aTagScore + aTermScore * 0.5;
      const bTagScore = phraseTagRelevancyScoreMap[bPhrase] || 0;
      const bTermScore = getTermRelevancyScore(
        bPhrase,
        tagsSortedBySpecificity,
        termTagsMap
      );
      const bScore = bTagScore + bTermScore * 0.5;
      return bScore - aScore;
    }
  );

  // If the user provides more tags, suggest less phrases.
  return sortedPhrases.slice(0, limit * (1 / tagsSortedBySpecificity.length));
};

export default getRelevantPhrases;
