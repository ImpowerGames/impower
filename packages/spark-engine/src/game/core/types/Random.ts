import { type RecursivePartial } from "./RecursivePartial";

/** [value, probability] */
export type ChanceSpec = [boolean, number];

/** [min, max, exponent]
 * Samples `Math.pow(rand[min, max], exponent)`.
 * The raw "range" form - output range is `[min^exp, max^exp]` (sign-dependent).
 */
export type PowSpec = [number, number, number];

/** [min, max, exponent, "lerp"]
 * Samples `Math.pow(rand[0,1], exponent)` then lerps into `[min, max]`.
 * Output is bounded to `[min, max]` regardless of exponent.
 * Biased toward `min` for exponent > 1. */
export type PowLerpSpec = [number, number, number, "lerp"];

/** Spec for a non-object, non-array leaf field. */
type RandomLeaf<T> =
  | T[]
  | ([T] extends [boolean] ? ChanceSpec : never)
  | ([T] extends [number] ? PowSpec | PowLerpSpec : never);

export type Random<T = any> = T extends object
  ? {
      [P in keyof Omit<T, "$type" | "$name">]?: T[P] extends (infer U)[]
        ? U extends object | undefined
          ? RecursivePartial<T[P]>[]
          : T[P][]
        : T[P] extends object | undefined
          ? RecursivePartial<T[P]>[] | Random<T[P]>
          : RandomLeaf<T[P]>;
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$type">>]: T[P];
    } & {
      [P in keyof Pick<T, Extract<keyof T, "$name">>]:
        | "$random"
        | `$random:${string}`;
    }
  : T;
