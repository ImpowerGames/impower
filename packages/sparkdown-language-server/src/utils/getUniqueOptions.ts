const getUniqueOptions = <T>(array: T[] | undefined): T[] =>
  Array.from(new Set(array));

export default getUniqueOptions;
