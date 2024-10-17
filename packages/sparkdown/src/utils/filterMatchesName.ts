const nameContainsTag = (id: string, tag: string) =>
  new RegExp(`\\b${tag}\\b`).test(id);

const filterMatchesName = (
  name: string,
  filter: { includes: string[]; excludes: string[] },
  filterableTag = "filter",
  defaultTag = "default"
) => {
  return (
    (!filterableTag || nameContainsTag(name, filterableTag)) &&
    (filter.excludes.some((tag) => tag && nameContainsTag(name, tag)) ||
      (!nameContainsTag(name, defaultTag) &&
        filter.includes.every((tag) => tag && !nameContainsTag(name, tag))))
  );
};

export default filterMatchesName;
