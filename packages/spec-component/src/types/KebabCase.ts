export type KebabCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? "-" : ""}${Lowercase<T>}${KebabCase<U>}`
  : S;
