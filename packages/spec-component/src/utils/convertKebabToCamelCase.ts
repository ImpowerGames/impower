import { CamelCase } from "../types/CamelCase";

export const convertKebabToCamelCase = <T extends string>(s: T): CamelCase<T> =>
  s.replace(/[-](\w)/g, (_, l) => l.toUpperCase()) as CamelCase<T>;
