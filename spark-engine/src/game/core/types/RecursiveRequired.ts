export type RecursiveRequired<T> = Required<{
  [P in keyof T]: T[P] extends object | undefined
    ? RecursiveRequired<Required<T[P]>>
    : T[P];
}>;
