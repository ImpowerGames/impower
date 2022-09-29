import { Collection } from "./Collection";

export interface OrderedCollection<T, K extends string = string>
  extends Collection<T, K> {
  order: K[];
}
