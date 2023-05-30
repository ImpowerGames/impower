export type ReadOnly<T> = { readonly [K in keyof T]: ReadOnly<T[K]> };
