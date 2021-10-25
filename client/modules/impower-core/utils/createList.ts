import { List } from "../types/interfaces/list";

const createList = <T = unknown, K extends string = string>(
  obj?: Partial<List<T, K>> & Pick<List<T, K>, "default">
): List<T, K> => ({
  order: [],
  data: {} as Record<K, T>,
  ...obj,
});

export default createList;
