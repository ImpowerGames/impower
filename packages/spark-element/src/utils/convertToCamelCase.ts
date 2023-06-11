import { CamelCase } from "../types/camelCase";

const convertToCamelCase = <T extends string>(s: T): CamelCase<T> =>
  s.replace(/[-_](\w\w$|\w)/g, (_, letter) =>
    letter.toUpperCase()
  ) as CamelCase<T>;

export default convertToCamelCase;
