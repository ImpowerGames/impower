export const getReversedMap = (map: {
  [key: string]: string;
}): { [value: string]: string } => {
  const reversedMap: { [value: string]: string } = {};
  const sortedEntries = Object.entries(map).sort(([, aValue], [, bValue]) =>
    aValue > bValue ? 1 : -1
  );
  sortedEntries.forEach(([key, value]) => {
    reversedMap[value] = key;
  });
  return reversedMap;
};
