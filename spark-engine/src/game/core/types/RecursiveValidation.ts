export type RecursiveValidation<T = any> = {
  [P in keyof T]: T[P] extends (infer U)[]
    ? [T[P], U[], U]
    : T[P] extends object | undefined
    ? RecursiveValidation<T[P]>
    : T[P] extends string
    ? [T[P]] | [T[P], T[P][], [boolean]]
    : T[P] extends number
    ?
        | [T[P]]
        | [T[P], [T[P]], [boolean]]
        | [T[P], [T[P], T[P]], [boolean, boolean]]
    : [T[P]];
};
