import { splitSpecificAndAdjacentTerms } from "./getTerms";
import { average } from "./math";

export const vectorizeTerms = (
  terms: string[],
  tagTerms: { [tag: string]: string[] },
  termVectors: { [word: string]: number[] }
): number[] => {
  const { specificTerms, adjacentTerms } = splitSpecificAndAdjacentTerms(terms);

  const specificVecs = specificTerms.map((term) => termVectors[term]);

  const adjacentVecs: number[][] = [];

  adjacentTerms.forEach((adjacentTerm) => {
    adjacentVecs.push(
      vectorizeTerms(
        tagTerms[adjacentTerm.replace(">", "")],
        tagTerms,
        termVectors
      )
    );
  });

  const specificAvgVec = average(specificVecs);

  return average([specificAvgVec, ...adjacentVecs]);
};

export const vectorizeTag = (
  tag: string,
  tagTerms: { [tag: string]: string[] },
  termVectors: { [word: string]: number[] }
): number[] => {
  const relatedTerms = tagTerms[tag];
  if (relatedTerms) {
    return vectorizeTerms(relatedTerms, tagTerms, termVectors);
  }
  return vectorizeTerms([tag], tagTerms, termVectors);
};

export const getTagVectors = (
  tagTerms: { [tag: string]: string[] },
  termVectors: { [word: string]: number[] }
): { [tag: string]: number[] } => {
  const tagVectors: { [tag: string]: number[] } = {};
  Object.keys(tagTerms).forEach((tag) => {
    tagVectors[tag] = vectorizeTag(tag, tagTerms, termVectors);
  });
  return tagVectors;
};
