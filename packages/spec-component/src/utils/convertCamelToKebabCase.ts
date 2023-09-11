import { KebabCase } from "../types/KebabCase";

const convertCamelToKebabCase = <T extends string>(s: T): KebabCase<T> =>
  s.replace(/[A-Z]+/g, (l: string) => `-${l.toLowerCase()}`) as KebabCase<T>;

export default convertCamelToKebabCase;
