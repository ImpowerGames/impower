import { Collection } from "../types/interfaces/collection";

const isCollection = <T, K extends string = string>(
  obj: unknown
): obj is Collection<T, K> => {
  if (!obj) {
    return false;
  }
  const collection = obj as Collection<T, K>;
  return collection.data !== undefined;
};

export default isCollection;
