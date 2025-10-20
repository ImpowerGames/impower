import { getProperty } from "./getProperty";

export function readProperty(
  propertyPath: string,
  obj: any,
  ...fallbacks: any[]
) {
  console.warn(propertyPath);
  const propertyValue = getProperty(obj, propertyPath);
  if (propertyValue !== undefined) {
    return propertyValue;
  }
  for (const fallback of fallbacks) {
    const propertyValue = getProperty(fallback, propertyPath);
    if (propertyValue !== undefined) {
      return propertyValue;
    }
  }
  return undefined;
}
