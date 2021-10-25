import { OrderedCollection } from "../types/interfaces/orderedCollection";
import isCollection from "./isCollection";

const isOrderedCollection = <T, K extends string = string>(
  obj: unknown
): obj is OrderedCollection<T, K> => {
  if (!obj) {
    return false;
  }
  const collection = obj as OrderedCollection<T, K>;
  return isCollection(collection) && collection.order !== undefined;
};

export default isOrderedCollection;
