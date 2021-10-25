import getAllTagsQuery from "./getAllTagsQuery";
import getSearchedTerms from "./getSearchedTerms";

const getTagSearchQuery = (search?: string): string[] => {
  const terms = getSearchedTerms(search);
  // Search posts that contain all these tags
  return [getAllTagsQuery(terms)];
};

export default getTagSearchQuery;
