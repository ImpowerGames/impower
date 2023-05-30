import { RecursivePartial } from "../../game";

export type RecursiveRandomization<T = any> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? U extends object | undefined
      ? RecursivePartial<T[P]>[]
      : T[P][]
    : T[P] extends object | undefined
    ? RecursivePartial<T[P]>[] | RecursiveRandomization<T[P]>
    : T[P][] | [string, boolean];
};
