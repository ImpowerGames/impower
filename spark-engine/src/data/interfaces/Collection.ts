export interface Collection<T, K extends string = string> {
  data: Record<K, T>;
}
