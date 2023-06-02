const groupBy = <T>(
  collection: T[],
  iteratee: (item: T) => string
): { [key: string]: T[] } => {
  const result: { [key: string]: T[] } = {};
  collection.forEach((v: T) => {
    const key = iteratee(v);
    result[key] = result[key] || [];
    result[key].push(v);
  });
  return result;
};

export default groupBy;
