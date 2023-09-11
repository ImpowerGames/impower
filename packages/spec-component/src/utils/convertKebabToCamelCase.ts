import { CamelCase } from "../types/CamelCase";

const convertKebabToCamelCase = <T extends string>(s: T): CamelCase<T> =>
  s.replace(/[-](\w\w$|\w)/g, (_, l) => l.toUpperCase()) as CamelCase<T>;

export default convertKebabToCamelCase;
