import getSearchedTerms from "./getSearchedTerms";

const getNameSearchQuery = (search?: string): string[] => {
  const terms = getSearchedTerms(search);
  // Search matches start of name exactly
  // or the exact phrase appears somewhere in the name (phrase words must be in the same order)
  return terms.map((t) => `name#${t}`);
};

export default getNameSearchQuery;
