import { splitSpecificAndAdjacentTerms } from "./getTerms";
import { average } from "./math";

export const vectorizeTerms = (
  terms: string[],
  concepts: { [tag: string]: string[] },
  termVectors: { [word: string]: number[] }
): number[] => {
  const { specificTerms, adjacentTerms } = splitSpecificAndAdjacentTerms(terms);

  const specificVecs = specificTerms.map((term) => termVectors[term] || []);

  const adjacentVecs: number[][] = [];

  adjacentTerms.forEach((adjacentTerm) => {
    adjacentVecs.push(
      vectorizeTerms(
        concepts[adjacentTerm.replace("^", "")] || [],
        concepts,
        termVectors
      )
    );
  });

  const specificAvgVec = average(specificVecs);

  return average([specificAvgVec, ...adjacentVecs]);
};

export const vectorizeTag = (
  tag: string,
  concepts: { [tag: string]: string[] },
  termVectors: { [word: string]: number[] }
): number[] => {
  const relatedTerms = concepts[tag];
  if (relatedTerms) {
    return vectorizeTerms(relatedTerms, concepts, termVectors);
  }
  return vectorizeTerms([tag], concepts, termVectors);
};

export const getTagVectors = (
  concepts: { [tag: string]: string[] },
  termVectors: { [word: string]: number[] }
): { [tag: string]: number[] } => {
  const tagVectors: { [tag: string]: number[] } = {};
  Object.keys(concepts).forEach((tag) => {
    tagVectors[tag] = vectorizeTag(tag, concepts, termVectors);
  });
  return tagVectors;
};
