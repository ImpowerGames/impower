import { List } from "../types/interfaces/list";
import isOrderedCollection from "./isOrderedCollection";

const isList = <T, K extends string = string>(
  obj: unknown
): obj is List<T, K> => {
  if (!obj) {
    return false;
  }
  const list = obj as List<T, K>;
  return isOrderedCollection(obj) && list.default !== undefined;
};

export default isList;
