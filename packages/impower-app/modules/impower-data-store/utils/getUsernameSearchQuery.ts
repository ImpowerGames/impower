import getSearchedTerms from "./getSearchedTerms";

const getUsernameSearchQuery = (search?: string): string[] => {
  const terms = getSearchedTerms(search);
  // Search matches start of username exactly
  return terms.map((t) => `username#${t}`);
};

export default getUsernameSearchQuery;
