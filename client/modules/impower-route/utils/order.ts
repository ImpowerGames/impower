export const reorder = (
  ids: string[],
  sourceIds: string[],
  sourceIndex: number,
  destinationIndex: number
): string[] => {
  const reorderedIds = sourceIds.length > 0 ? sourceIds : ids[sourceIndex];

  const orderedIds: string[] = [];
  const orderedSourceIds: string[] = [];
  let startSpliceIndex = 0;

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    if (reorderedIds.includes(id)) {
      orderedSourceIds.push(id);
    } else {
      if (i < destinationIndex) {
        startSpliceIndex += 1;
      }
      orderedIds.push(id);
    }
  }

  if (sourceIndex < destinationIndex) {
    startSpliceIndex += 1;
  }

  orderedIds.splice(startSpliceIndex, 0, ...orderedSourceIds);

  return orderedIds;
};
