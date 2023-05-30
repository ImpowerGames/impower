import { Collection } from "../types/interfaces/collection";

const createCollection = <T = unknown, K extends string = string>(
  obj?: Partial<Collection<T, K>>
): Collection<T, K> => ({
  data: {} as Record<K, T>,
  ...obj,
});

export default createCollection;
