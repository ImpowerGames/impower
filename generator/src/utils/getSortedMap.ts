export const getSortedMap = <T>(
  map: {
    [key: string]: T;
  },
  sortByValue = false
): { [value: string]: T } => {
  const sortedMap: { [value: string]: T } = {};
  const sortedEntries = Object.entries(map).sort(
    ([aKey, aValue], [bKey, bValue]) => {
      if (sortByValue) {
        if (Array.isArray(aValue) && Array.isArray(bValue)) {
          return aValue.length > bValue.length ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      }
      return aKey > bKey ? 1 : -1;
    }
  );
  sortedEntries.forEach(([key, value]) => {
    sortedMap[key] = value;
  });
  return sortedMap;
};
