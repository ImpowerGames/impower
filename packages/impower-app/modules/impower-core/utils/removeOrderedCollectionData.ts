import { OrderedCollection } from "../types/interfaces/orderedCollection";
import removeData from "./removeData";
import removeIds from "./removeIds";

const removeOrderedCollectionData = <T>(
  list: OrderedCollection<T>,
  ids: string[]
): OrderedCollection<T> => {
  return {
    ...list,
    order: removeIds(list.order, ids),
    data: removeData(list.data, ids),
  };
};

export default removeOrderedCollectionData;
