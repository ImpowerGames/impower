export const changeSelection = (
  newId: string,
  selectedIds: string[]
): string[] => {
  if (selectedIds.includes(newId)) {
    return selectedIds;
  }
  return [newId];
};

export const toggleSelection = (
  newId: string,
  selectedIds: string[]
): string[] => {
  if (selectedIds.includes(newId)) {
    return selectedIds.filter((id) => id !== newId);
  }
  return [...selectedIds, newId];
};

export const multiSelection = (
  newId: string,
  selectedIds: string[],
  allIds: string[]
): string[] => {
  const newIndex = allIds.indexOf(newId);
  const lastSelectedId = selectedIds[selectedIds.length - 1];
  const lastSelectedIndex = allIds.indexOf(lastSelectedId);

  if (newIndex === lastSelectedIndex) {
    return allIds;
  }

  // multi interacting in the same column
  // need to interact everything between the last index and the current index inclusive

  const isInteractingForwards = newIndex > lastSelectedIndex;
  const startIndex = isInteractingForwards ? lastSelectedIndex : newIndex;
  const endIndex = isInteractingForwards ? newIndex : lastSelectedIndex;

  const inBetweenIds: string[] = allIds.slice(startIndex, endIndex + 1);

  // everything in between needs to have its interaction toggled.
  // with the exception of the start and end values which will always be interacted
  const toAddIds: string[] = inBetweenIds.filter(
    (id: string): boolean => !selectedIds.includes(id)
  );

  const sortedIds: string[] = isInteractingForwards
    ? toAddIds
    : [...toAddIds].reverse();
  const combinedIds: string[] = [...selectedIds, ...sortedIds];

  return combinedIds;
};
