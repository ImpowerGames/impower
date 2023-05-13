export type StringLength<
  S extends string,
  Acc extends 0[] = []
> = S extends `${string}${infer Rest}`
  ? StringLength<Rest, [...Acc, 0]>
  : Acc["length"];

export type Separator = "-" | "_";

export type CamelCase<S extends string> =
  S extends `${infer T}${Separator}${infer U}`
    ? StringLength<U> extends 2
      ? `${T}${Uppercase<CamelCase<U>>}`
      : `${T}${Capitalize<CamelCase<U>>}`
    : S;

export type Unprefix<
  S extends string,
  P extends string
> = S extends `${P}${Separator}${infer U}` ? `${U}` : S;

export type CamelCased<T> = {
  [K in keyof T as K extends string ? CamelCase<K> : K]: T[K];
};

export type CamelCasedProperties<T> = {
  [K in keyof T as K extends string ? CamelCase<K> : K]:
    | string
    | number
    | boolean
    | null;
};

export type CamelCasedObjectMap<T extends Record<string, any>> = {
  [K in keyof T as K extends string ? CamelCase<K> : ""]: K;
};

export type CamelCasedArrayMap<T extends string> = {
  [K in T as K extends string ? CamelCase<K> : ""]: K;
};

export type UnprefixedCamelCasedArrayMap<T extends string, P extends string> = {
  [K in T as K extends string ? CamelCase<Unprefix<K, P>> : ""]: K;
};
