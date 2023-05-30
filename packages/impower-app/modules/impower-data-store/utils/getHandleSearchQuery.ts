import getSearchedTerms from "./getSearchedTerms";

const getHandleSearchQuery = (search?: string): string[] => {
  const terms = getSearchedTerms(search);
  // Search matches start of handle exactly
  return terms.map((t) => `handle#${t}`);
};

export default getHandleSearchQuery;
