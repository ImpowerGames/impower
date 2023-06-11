import { CamelCasedArrayMap } from "../types/camelCase";
import convertToCamelCase from "./convertToCamelCase";

const getAttributeNameMap = <T extends string>(
  obj: T[]
): CamelCasedArrayMap<T> =>
  Object.values(obj).reduce((p, c) => {
    const key = c;
    const propName = convertToCamelCase(key) as unknown as keyof typeof p;
    p[propName] = key as never;
    return p;
  }, {} as CamelCasedArrayMap<T>);

export default getAttributeNameMap;
