export type RecursiveValidation<T = any> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? U[]
    : T[P] extends object | undefined
    ? RecursiveValidation<T[P]>
    : T[P] extends number
    ? [T[P], T[P], T[P]]
    : T[P][];
};
