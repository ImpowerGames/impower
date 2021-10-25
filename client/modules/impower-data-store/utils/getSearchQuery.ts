import getHandleSearchQuery from "./getHandleSearchQuery";
import getNameSearchQuery from "./getNameSearchQuery";
import getSlugSearchQuery from "./getSlugSearchQuery";
import getSummarySearchQuery from "./getSummarySearchQuery";
import getTagSearchQuery from "./getTagSearchQuery";
import getUsernameSearchQuery from "./getUsernameSearchQuery";

const getSearchQuery = (option: {
  search?: string;
  searchTarget: "tags" | "name" | "username" | "handle" | "slug" | "summary";
}): string[] => {
  const { search, searchTarget } = option;
  switch (searchTarget) {
    case "tags":
      return getTagSearchQuery(search);
    case "name":
      return getNameSearchQuery(search);
    case "username":
      return getUsernameSearchQuery(search);
    case "handle":
      return getHandleSearchQuery(search);
    case "slug":
      return getSlugSearchQuery(search);
    case "summary":
      return getSummarySearchQuery(search);
    default:
      return undefined;
  }
};

export default getSearchQuery;
