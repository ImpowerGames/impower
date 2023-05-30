export interface Optional<T = unknown> {
  useDefault: boolean;
  value: T;
}
