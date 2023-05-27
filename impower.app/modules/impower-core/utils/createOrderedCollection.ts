import { OrderedCollection } from "../types/interfaces/orderedCollection";

const createOrderedCollection = <T = unknown, K extends string = string>(
  obj?: Partial<OrderedCollection<T, K>>
): OrderedCollection<T, K> => ({
  order: [],
  data: {} as Record<K, T>,
  ...obj,
});

export default createOrderedCollection;
