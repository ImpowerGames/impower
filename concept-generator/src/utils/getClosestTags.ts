import { vectorizeTag } from "./getTagVectors";
import { average, similarity } from "./math";

export const getClosestTags = (
  concepts: {
    [tag: string]: string[];
  },
  termVecs: {
    [word: string]: number[];
  },
  depth = 5,
  ...words: string[]
): string[] => {
  const targetConcept = average(words.map((w) => termVecs[w] || []));
  const tagConceptPairs: [string, number][] = Object.keys(concepts).map(
    (tag) => [
      tag,
      similarity(targetConcept, vectorizeTag(tag, concepts, termVecs)),
    ]
  );

  return tagConceptPairs
    .sort(([, aSim], [, bSim]) => bSim - aSim)
    .slice(0, depth)
    .map(([w]) => w);
};
