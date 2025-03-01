export type Description<T = any> = T extends object
  ? {
      [P in keyof Omit<T, "$type" | "$name">]?: T[P] extends (infer U)[]
        ? Description<U>[]
        : T[P] extends object | undefined
        ? Description<T[P]>
        : T[P] extends number
        ? Record<string, string>
        : Record<string, string>;
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$type">>]: T[P];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$name">>]: "$description";
    }
  : T | { $type: string };
