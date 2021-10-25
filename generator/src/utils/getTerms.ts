import { getCleanedTerm } from "./getCleanedTerm";
import { getTermAlternatives } from "./getTermAlternatives";

export const transformTerms = (terms: string[]): string[] =>
  [
    ...terms.map((term) => getCleanedTerm(term)),
    ...terms.flatMap((term) => getTermAlternatives(term)),
  ].sort();

export const splitSpecificAndAdjacentTerms = (
  terms: string[]
): { specificTerms: string[]; adjacentTerms: string[] } => {
  if (!terms) {
    return { specificTerms: [], adjacentTerms: [] };
  }
  const [specificTerms, adjacentTerms]: [string[], string[]] = terms.reduce(
    (result, tag) => {
      result[tag.startsWith(">") ? 1 : 0].push(tag);
      return result;
    },
    [[], []]
  );
  return { specificTerms, adjacentTerms };
};

export const unpackTerms = (
  terms: string[],
  tagTerms: { [tag: string]: string[] }
): string[] => {
  let { specificTerms, adjacentTerms } = splitSpecificAndAdjacentTerms(terms);

  while (adjacentTerms.length > 0) {
    specificTerms.push(
      ...adjacentTerms.flatMap((lookup) => tagTerms[lookup.replace(">", "")])
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
  tagTerms: { [tag: string]: string[] },
  allForms = false
): string[] => {
  const terms = unpackTerms(tagTerms[tag], tagTerms);
  if (!allForms) {
    return terms;
  }
  return transformTerms(terms);
};

export const unpackSpecificAndAdjacentTerms = (
  tag: string,
  tagTerms: { [tag: string]: string[] },
  allForms = false
): { specific: string[]; adjacent: string[] } => {
  const { specificTerms, adjacentTerms } = splitSpecificAndAdjacentTerms(
    tagTerms[tag]
  );
  if (!tagTerms[tag]) {
    console.warn("No terms exist in tagTerms.json for: ", tag);
  }

  const allSpecificTerms = unpackTerms(specificTerms, tagTerms);
  const allAdjacentTerms = unpackTerms(adjacentTerms, tagTerms);

  if (!allForms) {
    return { specific: allSpecificTerms, adjacent: allAdjacentTerms };
  }

  return {
    specific: transformTerms(allSpecificTerms),
    adjacent: transformTerms(allAdjacentTerms),
  };
};
