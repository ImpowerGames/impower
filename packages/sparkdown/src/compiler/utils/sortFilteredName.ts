export const sortFilteredName = (name: string) => {
  if (!name.includes("~")) {
    return name;
  }
  const parts = name.split("~");
  const [fileName, ...filterNames] = parts;
  const sortedFilterNames = filterNames.sort();
  return [fileName, ...sortedFilterNames].join("~");
};
