export type RecursiveRandomization<T = any> = {
  [P in keyof T]?: T[P] extends []
    ? T[P][]
    : T[P] extends object | undefined
    ? RecursiveRandomization<T[P]>
    : T[P][] | [string, boolean];
};
