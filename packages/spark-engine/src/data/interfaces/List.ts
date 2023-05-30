import { OrderedCollection } from "./OrderedCollection";

export interface List<T = unknown, K extends string = string>
  extends OrderedCollection<T, K> {
  default: T;
}
