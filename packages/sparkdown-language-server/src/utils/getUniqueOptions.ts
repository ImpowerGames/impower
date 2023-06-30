const getUniqueOptions = <T>(array: T[] | undefined): T[] =>
  Array.from(new Set(array?.filter((x) => Boolean(x))));

export default getUniqueOptions;
