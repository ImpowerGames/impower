export type RecursiveReadonly<T> = {
  readonly [K in keyof T]: RecursiveReadonly<T[K]>;
};
