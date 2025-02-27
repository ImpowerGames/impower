export const sortFilteredName = (nameWithFilters: string) => {
  const parts = nameWithFilters.split("~");
  const [fileName, ...filterNames] = parts;
  const sortedFilterNames = filterNames.sort();
  return [fileName, ...sortedFilterNames].join("~");
};
