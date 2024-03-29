import { getCleanedTerm } from "../../src/utils/getCleanedTerm";
import { getTermVariants } from "./getTermVariants";

export const transformTerms = (terms: string[]): string[] =>
  [
    ...terms.map((term) => getCleanedTerm(term)),
    ...terms.flatMap((term) => getTermVariants(term)),
  ].sort();

export const splitSpecificAndAdjacentTerms = (
  terms: string[]
): { specificTerms: string[]; adjacentTerms: string[] } => {
  if (!terms) {
    return { specificTerms: [], adjacentTerms: [] };
  }
  const [specificTerms, adjacentTerms]: [string[], string[]] = terms.reduce(
    (result: [string[], string[]], tag: string) => {
      result[tag.startsWith("^") ? 1 : 0].push(tag);
      return result;
    },
    [[], []]
  );
  return { specificTerms, adjacentTerms };
};

export const unpackTerms = (
  terms: string[],
  concepts: { [tag: string]: string[] }
): string[] => {
  let { specificTerms, adjacentTerms } = splitSpecificAndAdjacentTerms(terms);

  while (adjacentTerms.length > 0) {
    specificTerms.push(
      ...adjacentTerms.flatMap(
        (lookup) => concepts[lookup.replace("^", "")] || []
      )
    );
    const result = splitSpecificAndAdjacentTerms(specificTerms);
    specificTerms = result.specificTerms;
    adjacentTerms = result.adjacentTerms;
  }

  const allTerms = specificTerms.sort();

  const uniqueTerms = Array.from(new Set(allTerms)).filter((term) =>
    Boolean(term)
  );

  return uniqueTerms;
};

export const unpackTag = (
  tag: string,
  concepts: { [tag: string]: string[] },
  allForms = false
): string[] => {
  const terms = unpackTerms(concepts[tag] || [], concepts);
  if (!allForms) {
    return terms;
  }
  return transformTerms(terms);
};

export const unpackSpecificAndAdjacentTerms = (
  tag: string,
  concepts: { [tag: string]: string[] },
  allForms = false
): { specific: string[]; adjacent: string[] } => {
  const { specificTerms, adjacentTerms } = splitSpecificAndAdjacentTerms(
    concepts[tag] || []
  );
  if (!concepts[tag]) {
    console.warn("No terms exist in concepts.yaml for: ", tag);
  }

  const allSpecificTerms = unpackTerms(specificTerms, concepts);
  const allAdjacentTerms = unpackTerms(adjacentTerms, concepts);

  if (!allForms) {
    return { specific: allSpecificTerms, adjacent: allAdjacentTerms };
  }

  return {
    specific: transformTerms(allSpecificTerms),
    adjacent: transformTerms(allAdjacentTerms),
  };
};
