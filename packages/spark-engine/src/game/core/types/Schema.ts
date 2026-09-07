/**
 * An option a schema offers for a property: a concrete value, or `{ $type }`
 * naming a struct type whose instances are also accepted there (for example
 * `fill_color: ["black", "white", { $type: "color" }]`).
 */
export type SchemaOption<T> = T | { $type: string };

export type Schema<T = any> = T extends object
  ? {
      [P in keyof Omit<T, "$type" | "$name">]?: T[P] extends (infer U)[]
        ? Schema<U>[]
        : T[P] extends object | undefined
          ? Schema<T[P]> | SchemaOption<Schema<NonNullable<T[P]>>>[]
          : T[P] extends number
            ? [T[P], T[P], T[P], ...string[]]
            : SchemaOption<Schema<T[P]>>[];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$type">>]: T[P];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$name">>]: "$schema";
    }
  : T;
