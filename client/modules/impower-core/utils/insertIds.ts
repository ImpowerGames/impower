const insertIds = (
  ids: string[],
  idsToAdd: string[],
  index?: number
): string[] => {
  if (idsToAdd.length === 0) {
    return ids;
  }
  const newIdsToAdd = idsToAdd.filter((id) => !ids.includes(id));
  if (newIdsToAdd.length > 0) {
    const validIndex = index && index > -1 ? index : ids.length;
    const newIds = [...ids];
    newIds.splice(validIndex, 0, ...newIdsToAdd);
    return newIds;
  }
  return ids;
};

export default insertIds;
