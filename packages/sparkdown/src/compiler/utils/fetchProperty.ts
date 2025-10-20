export function fetchProperty(
  propertyPath: string,
  obj: any,
  ...fallbacks: any[]
) {
  const propertyValue = obj?.[propertyPath];
  if (propertyValue !== undefined) {
    return propertyValue;
  }
  for (const fallback of fallbacks) {
    const propertyValue = fallback?.[propertyPath];
    if (propertyValue !== undefined) {
      return propertyValue;
    }
  }
  return undefined;
}
