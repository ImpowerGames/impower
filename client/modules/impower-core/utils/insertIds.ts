const insertIds = (
  ids: string[],
  idsToAdd: string[],
  index?: number
): string[] => {
  const validIds = ids || [];
  if (idsToAdd.length === 0) {
    return validIds;
  }
  const newIdsToAdd = idsToAdd.filter((id) => !validIds.includes(id));
  if (newIdsToAdd.length > 0) {
    const validIndex = index && index > -1 ? index : validIds.length;
    const newIds = [...validIds];
    newIds.splice(validIndex, 0, ...newIdsToAdd);
    return newIds;
  }
  return validIds;
};

export default insertIds;
