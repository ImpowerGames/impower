import { RecursivePartial } from "./RecursivePartial";

export type Random<T = any> = T extends object
  ? {
      [P in keyof Omit<T, "$type" | "$name">]?: T[P] extends (infer U)[]
        ? U extends object | undefined
          ? RecursivePartial<T[P]>[]
          : T[P][]
        : T[P] extends object | undefined
        ? RecursivePartial<T[P]>[] | Random<T[P]>
        : T[P][] | [string, boolean];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$type">>]: T[P];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$name">>]:
        | "$random"
        | `$random:${string}`;
    }
  : T;
