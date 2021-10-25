import { OrderedCollection } from "../types/interfaces/orderedCollection";

const setOrderedCollectionOrder = <T>(
  collection: OrderedCollection<T>,
  ids: string[]
): OrderedCollection<T> => {
  return {
    ...collection,
    order: [...ids],
  };
};

export default setOrderedCollectionOrder;
