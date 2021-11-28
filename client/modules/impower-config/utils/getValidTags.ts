export const getValidTags = (
  tags: string[],
  recentlyRandomizedTags?: string[],
  lockedTags?: string[]
): string[] => {
  const forbiddenTags = new Set(
    recentlyRandomizedTags?.map((tag) => tag.toLowerCase()) || []
  );
  lockedTags.forEach((tag) => {
    forbiddenTags.add(tag.toLowerCase());
  });
  return tags.filter((tag) => !forbiddenTags.has(tag.toLowerCase()));
};
