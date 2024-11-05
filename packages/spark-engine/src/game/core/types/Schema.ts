export type Schema<T = any> = T extends object
  ? {
      [P in keyof Omit<T, "$type" | "$name">]?: T[P] extends (infer U)[]
        ? Schema<U>[]
        : T[P] extends object | undefined
        ? Schema<T[P]>
        : T[P] extends number
        ? [T[P], T[P], T[P]]
        : Schema<T[P]>[];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$type">>]: T[P];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$name">>]: "$schema";
    }
  : T | { $type: string };
