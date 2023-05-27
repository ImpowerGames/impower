import getSearchedTerms from "./getSearchedTerms";

const getSlugSearchQuery = (search?: string): string[] => {
  const terms = getSearchedTerms(search);
  // Search matches start of slug exactly
  return terms.map((t) => `slug#${t}`);
};

export default getSlugSearchQuery;
