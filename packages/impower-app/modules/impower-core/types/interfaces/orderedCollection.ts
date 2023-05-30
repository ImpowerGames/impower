import { Collection } from "./collection";

export interface OrderedCollection<T, K extends string = string>
  extends Collection<T, K> {
  order: K[];
}
