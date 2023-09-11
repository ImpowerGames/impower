import { CamelCasedArrayMap } from "../types/CamelCase";
import convertKebabToCamelCase from "./convertKebabToCamelCase";

const getAttributeNameMap = <T extends string>(
  obj: T[]
): CamelCasedArrayMap<T> =>
  Object.values(obj).reduce((p, c) => {
    const key = c;
    const propName = convertKebabToCamelCase(key) as unknown as keyof typeof p;
    p[propName] = key as never;
    return p;
  }, {} as CamelCasedArrayMap<T>);

export default getAttributeNameMap;
