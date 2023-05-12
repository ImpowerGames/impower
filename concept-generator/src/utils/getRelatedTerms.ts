import { vectorizeTag } from "./getTagVectors";
import { unpackTag } from "./getTerms";
import { similarity } from "./math";

export const getReversedOccuranceMap = (map: {
  [key: string]: [string, number][];
}): { [value: string]: string[] } => {
  const reversedMap: {
    [key: string]: [string, number][];
  } = {};
  Object.entries(map).forEach(([key, value]) => {
    value.forEach(([t, s]) => {
      const tReversedMap = reversedMap[t] || [];
      reversedMap[t] = tReversedMap;
      tReversedMap.push([key, s]);
    });
  });
  const sortedReversedMap: { [value: string]: string[] } = {};
  Object.keys(reversedMap)
    .sort()
    .forEach((key) => {
      sortedReversedMap[key] = Array.from(new Set(reversedMap[key]))
        .sort(([, aSim], [, bSim]) => bSim - aSim)
        .map(([t]) => t);
    });
  return sortedReversedMap;
};

export const getRelatedTerms = async (
  concepts: { [tag: string]: string[] },
  wordVecs: { [word: string]: number[] },
  words: string[],
  threshold = 0.3,
  depth = 5,
  tags: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{
  [tag: string]: string[];
}> => {
  const termTags: { [tag: string]: [string, number][] } = {};

  const targetTags = tags?.length > 0 ? ["<>"] : Object.keys(concepts);
  const targetConcepts =
    tags?.length > 0 ? { "<>": tags, ...concepts } : concepts;

  const total = targetTags.length * 2 + words.length;

  onProgress?.(-1, total);

  const conceptVecs: { [tag: string]: number[] } = {};
  targetTags.forEach((tag, index) => {
    onProgress?.(index, total);
    // Get all existing related terms to this tag,
    // making sure to unpack any referential tags (i.e. tags that start with "^")
    conceptVecs[tag] = vectorizeTag(tag, targetConcepts, wordVecs);
  });

  const unpackedConcepts: { [tag: string]: string[] } = {};
  targetTags.forEach((tag, index) => {
    onProgress?.(targetTags.length + index, total);
    // Get all existing related terms to this tag in all it's possible forms
    // (past/present/future tenses, possessive, negated, etc.)
    unpackedConcepts[tag] = unpackTag(tag, targetConcepts, true);
  });

  words.forEach((word, index) => {
    onProgress?.(targetTags.length * 2 + index, total);
    const pairs: [string, number][] = [];
    targetTags.forEach((tag) => {
      const wordVec = wordVecs[word];
      const tagVec = wordVecs[tag] || [];
      const conceptVec = conceptVecs[tag] || [];
      if (wordVec) {
        // This vector captures the conceptual nature of a tag
        const literalSim = similarity(wordVec, conceptVec);
        // This vector captures the figurative/lingual nature of a tag
        const figurativeSim = similarity(wordVec, tagVec);
        // To maximize the potential for puns and double entendres
        // we want to include tags that are similar both literally OR figuratively
        // therefore, we use the max similarity of both.
        pairs.push([tag, Math.max(literalSim, figurativeSim)]);
      }
    });

    if (!termTags[word]) {
      termTags[word] = [];
    }

    const relatedTags: [string, number][] = [];

    pairs
      .sort(([, aSim], [, bSim]) => bSim - aSim)
      .forEach(([tag, sim]) => {
        const existingTerms = unpackedConcepts[tag] || [];
        if (
          relatedTags.length < depth &&
          sim > threshold &&
          !existingTerms.includes(word)
        ) {
          relatedTags.push([tag, sim]);
        }
      });

    if (relatedTags.length > 0) {
      termTags[word] = relatedTags;
    }
  });

  const getReferencesCount = (tag: string) =>
    targetConcepts[tag]?.filter((term) => term.startsWith("^")).length || 0;

  const suggestedConcepts = getReversedOccuranceMap(termTags);

  const sortedSuggestedConcepts: {
    [tag: string]: string[];
  } = {};
  Object.entries(suggestedConcepts)
    .sort(
      ([tagA], [tagB]) => getReferencesCount(tagA) - getReferencesCount(tagB)
    )
    .forEach(([tag, suggestedTerms]) => {
      sortedSuggestedConcepts[tag] = suggestedTerms;
    });

  onProgress?.(total, total);

  return sortedSuggestedConcepts;
};
