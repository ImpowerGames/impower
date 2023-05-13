import { UnprefixedCamelCasedArrayMap } from "../types/camelCase";
import { convertToCamelCase } from "./convertToCamelCase";

export const getDependencyNameMap = <T extends string, P extends string>(
  obj: T[],
  prefix: P = "s" as P
): UnprefixedCamelCasedArrayMap<T, P> =>
  Object.values(obj).reduce((p, c) => {
    const key = c.replace(`${prefix}-`, "");
    const propName = convertToCamelCase(key) as unknown as keyof typeof p;
    p[propName] = key as never;
    return p;
  }, {} as UnprefixedCamelCasedArrayMap<T, P>);
