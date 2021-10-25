import getSearchedTerms from "./getSearchedTerms";

const getSummarySearchQuery = (search?: string): string[] => {
  const terms = getSearchedTerms(search)?.flatMap((t) => t.split(" "));
  // Search words appear somewhere in the summary (in any order)
  return terms.map((t) => `summary#${t}`);
};

export default getSummarySearchQuery;
