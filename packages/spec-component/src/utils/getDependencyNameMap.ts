import { UnprefixedCamelCasedArrayMap } from "../types/camelCase";
import convertKebabToCamelCase from "./convertKebabToCamelCase";

const getDependencyNameMap = <T extends string, P extends string>(
  obj: T[],
  prefix: P = "s" as P
): UnprefixedCamelCasedArrayMap<T, P> =>
  Object.values(obj).reduce((p, c) => {
    const key = c.replace(new RegExp(`^${prefix}-`), "");
    const propName = convertKebabToCamelCase(key) as unknown as keyof typeof p;
    p[propName] = c as never;
    return p;
  }, {} as UnprefixedCamelCasedArrayMap<T, P>);

export default getDependencyNameMap;
