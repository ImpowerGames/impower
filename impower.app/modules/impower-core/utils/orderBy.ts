const orderBy = <T, K extends string | number>(
  collection: T[],
  iteratee: (item: T) => K,
  order: "asc" | "desc" = "asc"
): T[] => {
  const result = collection.concat().sort((a, b) => {
    return iteratee(a) > iteratee(b) ? 1 : iteratee(b) > iteratee(a) ? -1 : 0;
  });
  if (order === "desc") {
    return result.reverse();
  }
  return result;
};

export default orderBy;
