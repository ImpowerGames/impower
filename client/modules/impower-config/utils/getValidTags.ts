export const getValidTags = (
  tags: string[],
  recentlyRandomizedTags?: string[],
  lockedTags?: string[]
): string[] => {
  const forbiddenTags = new Set(recentlyRandomizedTags || []);
  if (lockedTags) {
    lockedTags.forEach((tag) => {
      forbiddenTags.add(tag);
    });
  }
  return tags.filter((tag) => !forbiddenTags.has(tag));
};
