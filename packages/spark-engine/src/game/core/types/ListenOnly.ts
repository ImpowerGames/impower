export type ListenOnly<T> = {
  readonly [K in keyof T]: Omit<T[K], "emit">;
};
