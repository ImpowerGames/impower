import getSearchQuery from "./getSearchQuery";

const getAnySearchQuery = (options: {
  search?: string;
  searchTargets?: (
    | "tags"
    | "name"
    | "username"
    | "handle"
    | "slug"
    | "summary"
  )[];
}): string[] => {
  const { search, searchTargets } = options;
  return searchTargets.flatMap((searchTarget) =>
    getSearchQuery({ search, searchTarget })
  );
};

export default getAnySearchQuery;
