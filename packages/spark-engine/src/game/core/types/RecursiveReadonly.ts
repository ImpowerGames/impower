export type RecursiveReadonly<T> = T extends (infer R)[]
  ? DeepReadonlyArray<R>
  : T extends Function
  ? T
  : T extends object
  ? DeepReadonlyObject<T>
  : T;

interface DeepReadonlyArray<T> extends ReadonlyArray<RecursiveReadonly<T>> {}

type DeepReadonlyObject<T> = {
  readonly [P in keyof T]: RecursiveReadonly<T[P]>;
};
