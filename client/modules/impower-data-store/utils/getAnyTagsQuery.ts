import normalizeAll from "./normalizeAll";

const getAnyTagsQuery = (tags: string[]): string[] => {
  // Search posts that contain one of these tags
  const normalizedTags = normalizeAll(tags);
  return normalizedTags.map((t) => `tags#${t}`);
};

export default getAnyTagsQuery;
