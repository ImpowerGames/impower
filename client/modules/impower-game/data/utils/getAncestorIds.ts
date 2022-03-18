export const getAncestorIds = (sectionId: string): string[] => {
  if (sectionId == null) {
    return [];
  }
  const parts = sectionId.split(".");
  const partsCount = parts.length - 1;
  const ids: string[] = [sectionId];
  for (let i = 0; i < partsCount; i += 1) {
    parts.pop();
    ids.push(parts.join("."));
  }
  return ids;
};
