const removeIds = (ids: string[], idsToRemove: string[]): string[] => {
  if (idsToRemove.length === 0) {
    return ids;
  }
  return ids.filter((id) => !idsToRemove.includes(id));
};

export default removeIds;
