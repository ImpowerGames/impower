import normalizeAll from "./normalizeAll";

const getAllTagsQuery = (tags: string[]): string => {
  // Search posts that contain all these tags
  const normalizedTags = normalizeAll(tags);
  const tagsQuery = `tags#${normalizedTags.sort().join("#")}`;
  return tagsQuery;
};

export default getAllTagsQuery;
