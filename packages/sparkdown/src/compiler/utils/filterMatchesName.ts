const nameContainsTag = (id: string, tag: unknown) => {
  if (tag && typeof tag === "object") {
    if ("all" in tag && Array.isArray(tag.all)) {
      const groupedPatterns = tag.all.map((t) => `(?=.*\\b${t}\\b)`).join("");
      return new RegExp(`^${groupedPatterns}.*$`).test(id);
    }
  }
  if (tag) {
    return new RegExp(`\\b${tag}\\b`).test(id);
  }
  return false;
};

export const filterMatchesName = (
  name: string,
  filter: { includes: unknown[]; excludes: unknown[] },
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
