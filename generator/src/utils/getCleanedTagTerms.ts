import { transformTerms, unpackSpecificAndAdjacentTerms } from "./getTerms";

export const getCleanedTagTerms = (
  tagTerms: { [tag: string]: string[] },
  order: "alphabetical" | "term-count" = "alphabetical"
) => {
  const organizedTerms: { [tag: string]: string[] } = {};

  Object.entries(tagTerms).forEach(([tag, terms]) => {
    organizedTerms[tag] = Array.from(new Set(terms.sort()));
  });

  const cleanedTerms: { [tag: string]: string[] } = {};
  Object.entries(organizedTerms).forEach(([tag, terms]) => {
    const { specific, adjacent } = unpackSpecificAndAdjacentTerms(
      tag,
      tagTerms
    );
    const transformedSpecific = transformTerms(specific);
    const transformedAdjacent = transformTerms(adjacent);
    cleanedTerms[tag] = terms
      .filter(
        (term) =>
          !transformedAdjacent.includes(term) &&
          transformedSpecific.filter((t) => t === term).length < 2
      )
      .map((term) =>
        !term.startsWith(">") && term.includes(" ") && !term.includes("_")
          ? `_${term}_`
          : term
      )
      .sort();
  });

  const sortedTerms: { [tag: string]: string[] } = {};
  Object.entries(cleanedTerms)
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (order === "term-count") {
        return aValue.length - bValue.length;
      }
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    })
    .forEach(([tag, terms]) => {
      sortedTerms[tag] = terms;
    });

  return sortedTerms;
};
